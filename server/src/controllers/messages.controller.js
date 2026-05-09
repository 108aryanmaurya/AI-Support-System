import { HttpError } from '../utils/httpError.js';
import { createMessage, ensureOrgMembership } from '../services/support.service.js';
import { supabaseAdmin } from '../config/supabase.js';
import {
  getMaxMessageLength,
  isValidEmail,
  normalizeEmail,
  sanitizeIncomingPayloadForLog,
  sanitizeMessage,
} from '../utils/incomingMessageValidation.js';
import { emitIncomingMessageEvent } from '../utils/monitoring.js';
import { sendInboxAgentOutboundMessage } from '../services/inboxAgentSend.service.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = getMaxMessageLength();

function isTransientRpcFailure(error) {
  if (!error) return false;
  if (typeof error.status === 'number' && error.status >= 500) return true;
  return error.code === '57014' || error.code === '08006' || error.code === '08001';
}

async function callIncomingMessageRpcWithRetry(params) {
  const firstAttempt = await supabaseAdmin.rpc('handle_incoming_message', params);
  if (!firstAttempt.error || !isTransientRpcFailure(firstAttempt.error)) {
    return firstAttempt;
  }

  emitIncomingMessageEvent('rpc_retry_attempt', {
    code: firstAttempt.error.code,
    status: firstAttempt.error.status,
  });

  // Safe retry: DB function is atomic and idempotency key aware.
  return supabaseAdmin.rpc('handle_incoming_message', params);
}

export async function sendInboxMessageController(req, res, next) {
  try {
    const { conversation_id: conversationId, content } = req.body ?? {};
    const result = await sendInboxAgentOutboundMessage({
      userId: req.user.id,
      conversationId,
      rawContent: content,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createMessageController(req, res, next) {
  try {
    const {
      organizationId,
      conversationId,
      senderType = 'agent',
      senderMemberId = null,
      content,
      metadata = {},
    } = req.body ?? {};

    if (!organizationId || !conversationId) {
      throw new HttpError(400, 'organizationId and conversationId are required.');
    }

    const member = await ensureOrgMembership(req.user.id, organizationId);
    const resolvedSenderMemberId = senderType === 'agent' ? senderMemberId ?? member.id : senderMemberId;

    const message = await createMessage({
      organizationId,
      conversationId,
      senderType,
      senderUserId: senderType === 'agent' ? req.user.id : null,
      senderMemberId: resolvedSenderMemberId,
      content,
      metadata,
    });

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
}

export async function createIncomingMessageController(req, res, next) {
  try {
    const organizationId = req.body?.organizationId;
    const rawEmail = req.body?.customer?.email;
    const rawMessage = req.body?.message;
    const idempotencyKey =
      req.body?.idempotencyKey ??
      req.headers['x-idempotency-key'] ??
      req.headers['x-request-id'] ??
      null;

    if (typeof organizationId !== 'string' || !UUID_V4_REGEX.test(organizationId)) {
      throw new HttpError(400, 'organizationId must be a valid UUID.');
    }

    if (typeof rawEmail !== 'string') {
      throw new HttpError(400, 'customer.email is required.');
    }
    const normalizedEmail = normalizeEmail(rawEmail);
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      throw new HttpError(400, 'customer.email must be a valid email address.');
    }

    if (typeof rawMessage !== 'string') {
      throw new HttpError(400, 'message is required.');
    }
    const normalizedMessage = sanitizeMessage(rawMessage);
    if (!normalizedMessage) {
      throw new HttpError(400, 'message cannot be empty.');
    } 
    if (normalizedMessage.length > MAX_MESSAGE_LENGTH) {
      throw new HttpError(400, `message exceeds max length of ${MAX_MESSAGE_LENGTH} characters.`);
    }

    if (idempotencyKey !== null && typeof idempotencyKey !== 'string') {
      throw new HttpError(400, 'idempotency key must be a string.');
    }

    const safeLogPayload = sanitizeIncomingPayloadForLog({
      organizationId,
      email: normalizedEmail,
      message: normalizedMessage,
      idempotencyKey,
      ip: req.ip,
    });

    emitIncomingMessageEvent('request_received', safeLogPayload);

    const { data, error } = await callIncomingMessageRpcWithRetry({
      p_organization_id: organizationId,
      p_email: normalizedEmail,
      p_message: normalizedMessage,
      p_idempotency_key: typeof idempotencyKey === 'string' ? idempotencyKey.trim() : null,
    });

    if (error) {
      emitIncomingMessageEvent('request_failed', {
        ...safeLogPayload,
        code: error.code,
        status: error.status,
      });
      if (error.code === 'PGRST116') throw new HttpError(404, 'Organization not found.');
      if (error.code === '23514' || error.code === '22001' || error.code === '22P02') {
        throw new HttpError(400, 'Invalid incoming message payload.');
      }
      if (error.code === 'P0001') {
        if (error.message === 'ORGANIZATION_NOT_FOUND') {
          throw new HttpError(404, 'Organization not found.');
        }
        throw new HttpError(400, 'Request could not be processed.');
      }
      throw new HttpError(500, 'Failed to process incoming message.');
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.conversation_id || !row?.message_id) {
      throw new HttpError(500, 'Failed to process incoming message.');
    }

    emitIncomingMessageEvent('request_succeeded', {
      ...safeLogPayload,
      conversationId: row.conversation_id,
      messageId: row.message_id,
    });

    res.status(201).json({
      conversationId: row.conversation_id,
      messageId: row.message_id,
    });
  } catch (error) {
    next(error);
  }
}
