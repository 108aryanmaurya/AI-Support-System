import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import {
  sanitizeMessage,
  getMaxMessageLength,
} from '../../utils/incomingMessageValidation.js';
import { createMessage } from '../support.service.js';
import { scheduleInboundPostCustomerMessage } from '../automation/inboundAutomation.service.js';
import {
  evaluateInboundIngressPolicy,
  applyInboundIngressPostInsert,
  shouldSkipPostInboundAutomation,
} from '../ingress/ingressPolicy.service.js';
import { ensureVisitorCustomer } from './widgetCustomer.service.js';
import { syntheticVisitorEmail } from '../../utils/widgetCrypto.js';
import {
  prepareConversationForCustomerMessage,
  resolveActiveConversationForVisitor,
  createVisitorConversation,
} from './widgetConversation.service.js';
import { updateSessionConversationId } from './widgetSession.service.js';
import { findIncomingIdempotency } from '../lifecycle/inboundWeb.service.js';

export async function listConversationMessages({
  organizationId,
  conversationId,
  customerId,
  since = null,
  limit = 50,
}) {
  await prepareConversationForCustomerMessage({
    organizationId,
    conversationId,
    customerId,
  });

  let query = supabaseAdmin
    .from('messages')
    .select('id, conversation_id, sender_type, content, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(Math.min(limit, 100));

  if (since) {
    query = query.gt('created_at', since);
  }

  const { data, error } = await query;
  if (error) throw new HttpError(500, error.message || 'Failed to list messages.');

  return (data ?? []).filter((m) => m.sender_type === 'customer' || m.sender_type === 'agent');
}

export async function sendWidgetMessage({
  organizationId,
  visitor,
  installation,
  sessionId,
  conversationId: inputConversationId,
  content: rawContent,
  idempotencyKey = null,
}) {
  const content = sanitizeMessage(rawContent);
  if (!content) throw new HttpError(400, 'message cannot be empty.');
  if (content.length > getMaxMessageLength()) {
    throw new HttpError(400, `message exceeds max length of ${getMaxMessageLength()} characters.`);
  }

  const settings = installation.settings ?? {};
  if (settings.requireEmail !== false && !visitor.email && !visitor.customer_id) {
    throw new HttpError(400, 'Email is required before sending a message.');
  }

  const { customerId, customer, visitor: linkedVisitor } = await ensureVisitorCustomer({
    organizationId,
    visitor,
    email: visitor.email,
    name: visitor.name,
  });

  const email =
    customer?.email?.trim() ||
    syntheticVisitorEmail(linkedVisitor.id);

  if (idempotencyKey) {
    const dup = await findIncomingIdempotency({ organizationId, idempotencyKey });
    if (dup) {
      const { data: messageRow } = await supabaseAdmin
        .from('messages')
        .select('id, conversation_id, sender_type, content, metadata, created_at')
        .eq('id', dup.messageId)
        .single();
      return {
        conversationId: dup.conversationId,
        message: messageRow,
        duplicate: true,
      };
    }
  }

  const ingressEval = await evaluateInboundIngressPolicy({
    organizationId,
    channel: 'web',
    email,
    message: content,
  });

  if (ingressEval.decision === 'reject_spam') {
    throw new HttpError(422, 'Message rejected by ingress spam policy.');
  }

  if (ingressEval.decision === 'suppress_duplicate' && ingressEval.duplicate) {
    const { data: messageRow } = await supabaseAdmin
      .from('messages')
      .select('id, conversation_id, sender_type, content, metadata, created_at')
      .eq('id', ingressEval.duplicate.messageId)
      .single();
    return {
      conversationId: ingressEval.duplicate.conversationId,
      message: messageRow,
      duplicate: true,
    };
  }

  let conversationId = inputConversationId;
  if (conversationId) {
    await prepareConversationForCustomerMessage({
      organizationId,
      conversationId,
      customerId,
    });
  } else {
    const conv = await resolveActiveConversationForVisitor({
      organizationId,
      visitor: linkedVisitor,
      installation,
      sessionId,
    });
    conversationId = conv.id;
  }

  const message = await createMessage({
    organizationId,
    conversationId,
    senderType: 'customer',
    senderUserId: null,
    senderMemberId: null,
    content,
    metadata: { channel: 'web', source: 'widget', status: 'sent' },
  });

  const timestamp = message.created_at ?? new Date().toISOString();
  await supabaseAdmin
    .from('conversations')
    .update({
      last_message_at: timestamp,
      last_customer_message_at: timestamp,
      customer_reminder_sent_at: null,
    })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (idempotencyKey) {
    await supabaseAdmin.from('incoming_message_idempotency').upsert(
      {
        organization_id: organizationId,
        idempotency_key: idempotencyKey.trim(),
        conversation_id: conversationId,
        message_id: message.id,
      },
      { onConflict: 'organization_id,idempotency_key' },
    );
  }

  await updateSessionConversationId(sessionId, conversationId);

  const ingressPost = await applyInboundIngressPostInsert({
    organizationId,
    conversationId,
    messageId: message.id,
    message: content,
    evaluation: ingressEval,
  });

  if (!shouldSkipPostInboundAutomation(ingressEval) && !ingressPost.flagged) {
    scheduleInboundPostCustomerMessage({
      organizationId,
      conversationId,
      messageId: message.id,
    });
  }

  return {
    conversationId,
    message,
    duplicate: false,
  };
}

export async function submitPreChat({ organizationId, visitor, email, name }) {
  if (!email?.trim()) throw new HttpError(400, 'email is required.');
  const { visitor: updated } = await ensureVisitorCustomer({
    organizationId,
    visitor,
    email,
    name,
    customerType: 'LEAD',
  });
  return updated;
}
