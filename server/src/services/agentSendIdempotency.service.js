import { rateLimitConfig } from '../config/rateLimit.config.js';
import { connectRedis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

const LOCK_TTL_MS = 120_000;
const RESULT_CACHE_TTL_SEC = 86_400;
const CONFLICT_POLL_MS = 150;
const CONFLICT_POLL_ATTEMPTS = 12;

const CLIENT_REQUEST_ID_REGEX = /^[a-zA-Z0-9._:-]{8,128}$/;

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeClientRequestId(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') {
    throw new HttpError(400, 'client_request_id must be a string.');
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) {
    throw new HttpError(400, 'client_request_id must be at most 128 characters.');
  }
  if (!CLIENT_REQUEST_ID_REGEX.test(trimmed)) {
    throw new HttpError(400, 'client_request_id has an invalid format.');
  }
  return trimmed;
}

function lockKey(organizationId, clientRequestId) {
  return `${rateLimitConfig.redisKeyPrefix}agent:send:lock:${organizationId}:${clientRequestId}`;
}

function resultKey(organizationId, clientRequestId) {
  return `${rateLimitConfig.redisKeyPrefix}agent:send:result:${organizationId}:${clientRequestId}`;
}

/**
 * @param {string} organizationId
 * @param {string} clientRequestId
 * @returns {Promise<object | null>}
 */
async function getCachedSendResult(organizationId, clientRequestId) {
  try {
    const redis = await connectRedis();
    const raw = await redis.get(resultKey(organizationId, clientRequestId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} organizationId
 * @param {string} clientRequestId
 * @param {object} payload
 */
async function setCachedSendResult(organizationId, clientRequestId, payload) {
  try {
    const redis = await connectRedis();
    await redis.set(
      resultKey(organizationId, clientRequestId),
      JSON.stringify(payload),
      'EX',
      RESULT_CACHE_TTL_SEC,
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[agent-send-idempotency] redis cache set failed:', e?.message ?? e);
  }
}

/**
 * @param {string} organizationId
 * @param {string} clientRequestId
 * @returns {Promise<{ message_id: string, conversation_id: string } | null>}
 */
async function loadIdempotencyRow(organizationId, clientRequestId) {
  const { data, error } = await supabaseAdmin
    .from('agent_send_idempotency')
    .select('message_id, conversation_id')
    .eq('organization_id', organizationId)
    .eq('client_request_id', clientRequestId)
    .maybeSingle();

  if (error) {
    const missing =
      error.message?.includes('agent_send_idempotency') ||
      error.code === '42P01' ||
      error.code === 'PGRST205';
    if (missing) return null;
    throw new HttpError(500, error.message || 'Failed to load send idempotency.');
  }
  return data;
}

/**
 * @param {string} organizationId
 * @param {string} messageId
 */
async function loadMessageForReplay(organizationId, messageId) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load idempotent message.');
  if (!data) throw new HttpError(404, 'Idempotent message not found.');
  return data;
}

function buildSendResultFromMessage(message) {
  const meta = message.metadata && typeof message.metadata === 'object' ? message.metadata : {};
  const status = meta.status ?? meta.delivery_status;
  const deliveryStatus = status === 'failed' ? 'failed' : 'sent';
  return {
    message,
    deliveryStatus,
    idempotentReplay: true,
  };
}

async function resolveReplayResult(organizationId, clientRequestId) {
  const cached = await getCachedSendResult(organizationId, clientRequestId);
  if (cached?.message) return cached;

  const row = await loadIdempotencyRow(organizationId, clientRequestId);
  if (!row?.message_id) return null;

  const message = await loadMessageForReplay(organizationId, row.message_id);
  const payload = buildSendResultFromMessage(message);
  await setCachedSendResult(organizationId, clientRequestId, payload);
  return payload;
}

async function waitForConcurrentSend(organizationId, clientRequestId) {
  for (let i = 0; i < CONFLICT_POLL_ATTEMPTS; i += 1) {
    await new Promise((r) => setTimeout(r, CONFLICT_POLL_MS));
    const replay = await resolveReplayResult(organizationId, clientRequestId);
    if (replay) return replay;
  }
  throw new HttpError(
    409,
    'A send with this client_request_id is already in progress. Retry shortly.',
  );
}

/**
 * @returns {Promise<
 *   | { mode: 'skip' }
 *   | { mode: 'replay', result: object }
 *   | { mode: 'proceed', clientRequestId: string }
 * >}
 */
export async function beginAgentSendIdempotency({
  organizationId,
  clientRequestId: rawClientRequestId,
  conversationId,
}) {
  const clientRequestId = normalizeClientRequestId(rawClientRequestId);
  if (!clientRequestId) return { mode: 'skip' };

  const replay = await resolveReplayResult(organizationId, clientRequestId);
  if (replay) {
    if (replay.message?.conversation_id && replay.message.conversation_id !== conversationId) {
      throw new HttpError(409, 'client_request_id was already used for a different conversation.');
    }
    return { mode: 'replay', result: replay };
  }

  try {
    const redis = await connectRedis();
    const acquired = await redis.set(lockKey(organizationId, clientRequestId), '1', 'PX', LOCK_TTL_MS, 'NX');
    if (acquired !== 'OK') {
      const afterLock = await waitForConcurrentSend(organizationId, clientRequestId);
      if (afterLock.message?.conversation_id && afterLock.message.conversation_id !== conversationId) {
        throw new HttpError(409, 'client_request_id was already used for a different conversation.');
      }
      return { mode: 'replay', result: afterLock };
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // eslint-disable-next-line no-console
    console.warn('[agent-send-idempotency] redis lock failed, proceeding without lock:', e?.message ?? e);
  }

  return { mode: 'proceed', clientRequestId };
}

/**
 * Persist idempotency + cache response for retries.
 */
export async function commitAgentSendIdempotency({
  organizationId,
  clientRequestId,
  conversationId,
  messageId,
  result,
}) {
  if (!clientRequestId) return;

  const { error } = await supabaseAdmin.from('agent_send_idempotency').upsert(
    {
      organization_id: organizationId,
      client_request_id: clientRequestId,
      conversation_id: conversationId,
      message_id: messageId,
    },
    { onConflict: 'organization_id,client_request_id' },
  );

  if (error) {
    const missing =
      error.message?.includes('agent_send_idempotency') ||
      error.code === '42P01' ||
      error.code === 'PGRST205';
    if (!missing) {
      // eslint-disable-next-line no-console
      console.warn('[agent-send-idempotency] db upsert failed:', error.message);
    }
  }

  await setCachedSendResult(organizationId, clientRequestId, result);

  try {
    const redis = await connectRedis();
    await redis.del(lockKey(organizationId, clientRequestId));
  } catch {
    /* ignore */
  }
}

/** Release lock when validation fails before a message row exists. */
export async function releaseAgentSendIdempotencyLock({ organizationId, clientRequestId }) {
  if (!clientRequestId) return;
  try {
    const redis = await connectRedis();
    await redis.del(lockKey(organizationId, clientRequestId));
  } catch {
    /* ignore */
  }
}
