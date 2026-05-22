import { HttpError } from '../utils/httpError.js';
import { createMessage } from '../services/support.service.js';
import { supabaseAdmin } from '../config/supabase.js';
import { MESSAGE_SENDER_TYPES, isMessageSenderType } from '@ai-support/shared';
import {
  getMaxMessageLength,
  isValidEmail,
  normalizeEmail,
  sanitizeIncomingPayloadForLog,
  sanitizeMessage,
} from '../utils/incomingMessageValidation.js';
import { emitIncomingMessageEvent } from '../utils/monitoring.js';
import { sendInboxAgentOutboundMessage } from '../services/inboxAgentSend.service.js';
import { isCustomerMessageFreshForNotification } from '../services/customerInboundNotification.service.js';
import { scheduleStaffInboundWithFallback } from '../services/automation/automationNotify.service.js';
import { scheduleInboundPostCustomerMessage } from '../services/automation/inboundAutomation.service.js';
import { emitSupportEvent } from '../services/analytics/supportEvents.service.js';
import {
  applyInboundIngressPostInsert,
  evaluateInboundIngressPolicy,
  logIngressDecision,
  shouldSkipPostInboundAutomation,
} from '../services/ingress/ingressPolicy.service.js';

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

  return supabaseAdmin.rpc('handle_incoming_message', params);
}

export async function sendInboxMessageController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    if (!organizationId) {
      throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
    }

    const {
      conversation_id: conversationId,
      content,
      client_request_id: clientRequestIdSnake,
      clientRequestId: clientRequestIdCamel,
      is_ai_generated: isAiGeneratedSnake,
      isAiGenerated: isAiGeneratedCamel,
      ai_run_id: aiRunIdSnake,
      aiRunId: aiRunIdCamel,
      parent_message_id: parentMessageIdSnake,
      parentMessageId: parentMessageIdCamel,
    } = req.body ?? {};
    const result = await sendInboxAgentOutboundMessage({
      userId: req.userId ?? req.user.id,
      conversationId,
      rawContent: content,
      expectedOrganizationId: organizationId,
      clientRequestId: clientRequestIdSnake ?? clientRequestIdCamel ?? null,
      isAiGenerated: isAiGeneratedSnake ?? isAiGeneratedCamel ?? false,
      aiRunId: aiRunIdSnake ?? aiRunIdCamel ?? null,
      parentMessageId: parentMessageIdSnake ?? parentMessageIdCamel ?? null,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createMessageController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    if (!organizationId) {
      throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
    }

    const {
      conversationId,
      senderType: rawSenderType = 'agent',
      senderMemberId = null,
      content,
      metadata = {},
    } = req.body ?? {};

    if (!conversationId) {
      throw new HttpError(400, 'conversationId is required.');
    }

    const senderType = typeof rawSenderType === 'string' ? rawSenderType.trim() : 'agent';
    if (!isMessageSenderType(senderType)) {
      throw new HttpError(
        400,
        `senderType must be one of: ${MESSAGE_SENDER_TYPES.join(', ')}.`,
      );
    }

    const member = req.orgMembership;
    if (!member?.id) {
      throw new HttpError(500, 'Membership missing (middleware misconfigured).');
    }

    const memberBacked = senderType === 'agent' || senderType === 'internal_note';
    const resolvedSenderMemberId = memberBacked ? senderMemberId ?? member.id : null;

    const message = await createMessage({
      organizationId,
      conversationId,
      senderType,
      senderUserId: memberBacked ? req.userId ?? req.user.id : null,
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
    console.log('createIncomingMessageController')
    const organizationId =
      typeof req.params?.orgId === 'string' ? req.params.orgId.trim() : '';

    if (!organizationId || !UUID_V4_REGEX.test(organizationId)) {
      throw new HttpError(400, 'orgId path parameter must be a valid UUID.');
    }

    const rawEmail = req.body?.customer?.email;
    const rawMessage = req.body?.message;
    const idempotencyKey =
      req.body?.idempotencyKey ??
      req.headers['x-idempotency-key'] ??
      req.headers['x-request-id'] ??
      null;

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

    const ingressEval = await evaluateInboundIngressPolicy({
      organizationId,
      channel: 'web',
      email: normalizedEmail,
      message: normalizedMessage,
    });
    logIngressDecision(ingressEval, organizationId);

    if (ingressEval.decision === 'reject_spam') {
      emitSupportEvent({
        organizationId,
        eventType: 'ingress.spam_rejected',
        entityType: 'conversation',
        entityId: organizationId,
        channelType: 'web',
        payload: {
          email: normalizedEmail,
          score: ingressEval.spam?.score,
          signals: ingressEval.spam?.signals,
        },
      });
      throw new HttpError(422, 'Message rejected by ingress spam policy.');
    }

    if (ingressEval.decision === 'suppress_duplicate' && ingressEval.duplicate) {
      emitSupportEvent({
        organizationId,
        eventType: 'ingress.duplicate_suppressed',
        entityType: 'conversation',
        entityId: ingressEval.duplicate.conversationId,
        channelType: 'web',
        payload: {
          message_id: ingressEval.duplicate.messageId,
          email: normalizedEmail,
        },
      });
      res.status(200).json({
        conversationId: ingressEval.duplicate.conversationId,
        messageId: ingressEval.duplicate.messageId,
        duplicate: true,
      });
      return;
    }

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

    const ingressPost = await applyInboundIngressPostInsert({
      organizationId,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      message: normalizedMessage,
      evaluation: ingressEval,
    });

    console.log('ingressPost', ingressPost)
    if (!shouldSkipPostInboundAutomation(ingressEval) && !ingressPost.flagged) {
      console.log('scheduleInboundPostCustomerMessage')
      scheduleInboundPostCustomerMessage({
        organizationId,
        conversationId: row.conversation_id,
        messageId: row.message_id,
      });
    }

    const notifyFresh = await isCustomerMessageFreshForNotification(row.message_id);
    if (notifyFresh) {
      const notifyJobKey =
        typeof idempotencyKey === 'string' && idempotencyKey.trim()
          ? `inbound:${organizationId}:${idempotencyKey.trim()}`
          : `inbound:${organizationId}:${row.message_id}`;
      void scheduleStaffInboundWithFallback({
        organizationId,
        conversationId: row.conversation_id,
        messageId: row.message_id,
        customerMessage: normalizedMessage,
        customerEmail: normalizedEmail,
        channelLabel: 'api',
        idempotencyKey: notifyJobKey,
      });
    }

    res.status(201).json({
      conversationId: row.conversation_id,
      messageId: row.message_id,
    });
  } catch (error) {
    next(error);
  }
}
