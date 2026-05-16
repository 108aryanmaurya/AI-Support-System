import { rateLimitConfig } from '../config/rateLimit.config.js';
import { connectRedis } from '../config/redis.js';
import { emitSupportEvent } from './analytics/supportEvents.service.js';

const MAX_ERROR_MESSAGE_LEN = 500;

/**
 * Redis SET NX dedupe — shared across API replicas.
 * @param {string} dedupeKey
 * @returns {Promise<boolean>} true when stderr log should be written
 */
async function shouldLogFailure(dedupeKey) {
  try {
    const redis = await connectRedis();
    const key = `${rateLimitConfig.redisKeyPrefix}outbound:log:${dedupeKey}`;
    const result = await redis.set(
      key,
      '1',
      'PX',
      rateLimitConfig.outboundMonitor.logDedupeMs,
      'NX',
    );
    return result === 'OK';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[outbound-dedupe] redis error, logging anyway:', e?.message ?? e);
    return true;
  }
}

/**
 * Normalize outbound errors for logs and analytics payloads.
 * @param {unknown} err
 */
export function normalizeOutboundError(err) {
  if (!err) {
    return { error_code: 'unknown', error_message: 'Unknown outbound error' };
  }
  const code =
    typeof err.code === 'string'
      ? err.code
      : typeof err.statusCode === 'number'
        ? `http_${err.statusCode}`
        : err.name && typeof err.name === 'string'
          ? err.name
          : 'outbound_error';
  const raw =
    typeof err.message === 'string'
      ? err.message
      : typeof err === 'string'
        ? err
        : 'Outbound delivery failed';
  const error_message =
    raw.length > MAX_ERROR_MESSAGE_LEN ? `${raw.slice(0, MAX_ERROR_MESSAGE_LEN)}…` : raw;
  return { error_code: code, error_message };
}

/**
 * Structured log + analytics when agent/AI outbound delivery fails.
 * Events are always recorded; stderr JSON logs are deduped via Redis per org/conversation/code.
 */
export async function recordOutboundDeliveryFailure({
  organizationId,
  conversationId,
  messageId,
  channelType = null,
  actorMemberId = null,
  senderType = 'agent',
  err,
}) {
  const { error_code, error_message } = normalizeOutboundError(err);
  const dedupeKey = `${organizationId}:${conversationId}:${error_code}`;

  if (await shouldLogFailure(dedupeKey)) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'error',
        component: 'outbound_delivery',
        ts: new Date().toISOString(),
        organization_id: organizationId,
        conversation_id: conversationId,
        message_id: messageId,
        channel_type: channelType,
        sender_type: senderType,
        error_code,
        error_message,
      }),
    );
  }

  emitSupportEvent({
    organizationId,
    eventType: 'message.outbound_failed',
    entityType: 'message',
    entityId: messageId,
    actorMemberId,
    channelType,
    payload: {
      conversation_id: conversationId,
      sender_type: senderType,
      error_code,
      error_message,
    },
  });
}

/** For internal ops diagnostics. */
export function getOutboundMonitorStats() {
  return {
    log_dedupe_backend: 'redis',
    log_dedupe_window_ms: rateLimitConfig.outboundMonitor.logDedupeMs,
  };
}
