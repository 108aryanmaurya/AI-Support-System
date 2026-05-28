import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { createConversation, createMessage, findOrCreateCustomer } from './support.service.js';
import { scheduleInboundPostCustomerMessage } from './automation/inboundAutomation.service.js';
import { emitSupportEvent } from './analytics/supportEvents.service.js';
import {
  applyInboundIngressPostInsert,
  evaluateInboundIngressPolicy,
  logIngressDecision,
  shouldSkipPostInboundAutomation,
} from './ingress/ingressPolicy.service.js';
import { CONVERSATION_ACTIVE_STATUSES } from '@ai-support/shared';
import { maybeReopenEmailThreadConversation } from './lifecycle/conversationLifecycle.service.js';

function isMissingColumnError(error, column) {
  if (!error) return false;
  const message = `${error.message || ''} ${error.details || ''}`;
  return message.includes(`'${column}'`) && message.toLowerCase().includes('column');
}

function isOneOpenConversationConstraint(error) {
  if (!error) return false;
  const raw = `${error.message || ''} ${error.details || ''}`;
  return raw.includes('idx_conversations_one_open_per_customer');
}

function readConfigEmailCandidates(config) {
  if (!config || typeof config !== 'object') return [];

  const candidates = [
    config.to_email,
    config.inbound_email,
    config.reply_to_email,
    config.support_email,
    config.email,
  ];

  if (Array.isArray(config.addresses)) {
    for (const value of config.addresses) candidates.push(value);
  }

  return candidates
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function domainFromEmail(email) {
  if (!email.includes('@')) return '';
  return email.split('@')[1] ?? '';
}

function configMatchesToEmail(config, toEmail) {
  const emailCandidates = readConfigEmailCandidates(config);
  if (emailCandidates.includes(toEmail)) return true;

  const configDomain =
    typeof config?.domain === 'string' ? config.domain.trim().toLowerCase() : '';
  if (!configDomain) return false;
  return domainFromEmail(toEmail) === configDomain;
}

function isLikelyInternalRoutingNotification(payload) {
  const subject = typeof payload?.subject === 'string' ? payload.subject.trim().toLowerCase() : '';
  const body = typeof payload?.textBody === 'string' ? payload.textBody : '';
  const subjectMatch =
    subject.startsWith('unassigned conversation') || subject.startsWith('new customer message');
  const bodyMatch =
    body.includes('A new customer message arrived but intelligent routing could not assign an agent.') ||
    (body.includes('Message from customer') &&
      body.includes('Top eligibility drop codes:') &&
      body.includes('Open inbox:') &&
      body.includes('— AI Support'));
  return subjectMatch && bodyMatch;
}

export async function resolveOrganizationEmailChannel(toEmail) {
  const { data, error } = await supabaseAdmin
    .from('channel_integrations')
    .select('id, provider, config, webhook_secret, channels!inner(id, organization_id, type, is_active, name)')
    .eq('channels.type', 'email')
    .eq('channels.is_active', true);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to resolve email channel.');
  }

  const match = (data ?? []).find((integration) => configMatchesToEmail(integration.config, toEmail));
  if (!match?.channels) {
    throw new HttpError(404, 'No organization email channel found for recipient address.');
  }

  return {
    channel: match.channels,
    integration: {
      id: match.id,
      provider: match.provider,
      config: match.config ?? {},
      webhookSecret: match.webhook_secret ?? null,
    },
  };
}

export async function findExistingInboundMessage({ organizationId, externalMessageId }) {
  if (!externalMessageId) return null;

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id, conversation_id')
    .eq('organization_id', organizationId)
    .filter('metadata->>external_message_id', 'eq', externalMessageId)
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to check duplicate message.');
  return data ?? null;
}

export async function resolveEmailThreadByKey({ organizationId, threadKey }) {
  if (!threadKey) return null;

  const { data, error } = await supabaseAdmin
    .from('email_threads')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('thread_key', threadKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to resolve email thread.');
  return data ?? null;
}

export async function ensureEmailThread({
  organizationId,
  customerId,
  conversationId,
  threadKey,
  subject,
}) {
  if (!threadKey) return null;

  const { data: existing, error: findError } = await supabaseAdmin
    .from('email_threads')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('thread_key', threadKey)
    .limit(1)
    .maybeSingle();

  if (findError) throw new HttpError(500, findError.message || 'Failed to check email thread.');
  if (existing) return existing;

  const insertPayload = {
    organization_id: organizationId,
    customer_id: customerId,
    conversation_id: conversationId,
    thread_key: threadKey,
    subject: subject || null,
  };

  const { data, error } = await supabaseAdmin
    .from('email_threads')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error && isMissingColumnError(error, 'subject')) {
    // Backward compatibility for environments where subject column migration is not applied yet.
    const fallbackPayload = {
      organization_id: organizationId,
      customer_id: customerId,
      conversation_id: conversationId,
      thread_key: threadKey,
    };
    const { data: fallbackData, error: fallbackError } = await supabaseAdmin
      .from('email_threads')
      .insert(fallbackPayload)
      .select('*')
      .single();
    if (fallbackError) {
      throw new HttpError(500, fallbackError.message || 'Failed to store email thread.');
    }
    return fallbackData;
  }

  if (error) throw new HttpError(500, error.message || 'Failed to store email thread.');
  return data;
}

async function resolveConversationForThread({ organizationId, thread }) {
  if (!thread?.conversation_id) return null;
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('id', thread.conversation_id)
    .eq('organization_id', organizationId)
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load threaded conversation.');
  return data ?? null;
}

async function resolveExistingOpenEmailConversation({ organizationId, customerId, channelId }) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId)
    .eq('channel_type', 'email')
    .in('status', [...CONVERSATION_ACTIVE_STATUSES])
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load existing email conversation.');
  return data ?? null;
}

function resolveEmailConversationSubject(subject, normalizedSubject) {
  const raw = typeof subject === 'string' ? subject.trim() : '';
  if (raw) return raw;
  const norm = typeof normalizedSubject === 'string' ? normalizedSubject.trim() : '';
  if (norm) return norm;
  return '(no subject)';
}

function resolveEmailConversationThreadKey(messageId, normalizedSubject) {
  const mid = typeof messageId === 'string' ? messageId.trim() : '';
  if (mid) return mid;
  const subjectKey = typeof normalizedSubject === 'string' ? normalizedSubject.trim() : '';
  if (subjectKey) return subjectKey;
  return null;
}

async function createOrReuseEmailConversation({
  organizationId,
  customerId,
  channelId,
  subject,
  threadKey,
}) {
  try {
    return await createConversation({
      organizationId,
      customerId,
      source: 'email',
      channelType: 'email',
      channelId,
      metadata: { channel: 'email' },
      createdByUserId: null,
      subject,
      threadKey,
    });
  } catch (error) {
    if (!isOneOpenConversationConstraint(error)) throw error;

    // Some environments enforce one open conversation per customer.
    // Reuse it so inbound emails keep flowing instead of failing webhook ingestion.
    const existing = await resolveExistingOpenEmailConversation({
      organizationId,
      customerId,
      channelId,
    });
    if (existing) return existing;
    throw error;
  }
}

/**
 * Resolve or create email thread with strict priority:
 * 1) in_reply_to exact key match
 * 2) normalized subject key match
 * 3) new thread + new conversation
 */
export async function findOrCreateEmailThread({
  organizationId,
  customerId,
  channelId,
  inReplyTo,
  normalizedSubject,
  messageId,
  subject,
}) {
  const replyKey = typeof inReplyTo === 'string' ? inReplyTo.trim() : '';
  const subjectKey = typeof normalizedSubject === 'string' ? normalizedSubject.trim() : '';

  let thread = null;
  let matchedBy = null;

  if (replyKey) {
    thread = await resolveEmailThreadByKey({ organizationId, threadKey: replyKey });
    if (thread) matchedBy = 'in_reply_to';
  }

  if (!thread && subjectKey) {
    thread = await resolveEmailThreadByKey({ organizationId, threadKey: subjectKey });
    if (thread) matchedBy = 'subject';
  }

  if (thread) {
    const existingConversation = await resolveConversationForThread({ organizationId, thread });
    if (existingConversation) {
      return {
        thread,
        conversation: existingConversation,
        createdConversation: false,
        matchedBy,
      };
    }
  }

  // New subject/no thread match => new conversation.
  const conversationSubject = resolveEmailConversationSubject(subject, normalizedSubject);
  const threadKey = resolveEmailConversationThreadKey(messageId, normalizedSubject) ?? subjectKey;
  const conversation = await createOrReuseEmailConversation({
    organizationId,
    customerId,
    channelId,
    subject: conversationSubject,
    threadKey,
  });

  const savedThread = await ensureEmailThread({
    organizationId,
    customerId,
    conversationId: conversation.id,
    threadKey: threadKey || conversation.thread_key,
    subject: conversationSubject,
  });

  return {
    thread: savedThread,
    conversation,
    createdConversation: true,
    matchedBy: 'new',
  };
}

export async function updateConversationLastMessageAt(conversationId, organizationId, createdAt = null) {
  const timestamp = createdAt ?? new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: timestamp })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (error) throw new HttpError(500, error.message || 'Failed to update conversation activity.');
}

export async function processInboundEmail(payload) {
  const { channel, integration } = await resolveOrganizationEmailChannel(payload.toEmail);

  if (isLikelyInternalRoutingNotification(payload)) {
    // eslint-disable-next-line no-console
    console.warn('[email-webhook] ignored internal routing notification loop', {
      organization_id: channel.organization_id,
      subject: payload.subject || null,
      from_email: payload.fromEmail || null,
    });
    return {
      status: 'ignored_internal_notification',
      organizationId: channel.organization_id,
      reason: 'notification_loop',
    };
  }

  const duplicate = await findExistingInboundMessage({
    organizationId: channel.organization_id,
    externalMessageId: payload.messageId,
  });
  if (duplicate) {
    return { status: 'duplicate', duplicate, organizationId: channel.organization_id };
  }

  const ingressEval = await evaluateInboundIngressPolicy({
    organizationId: channel.organization_id,
    channel: 'email',
    email: payload.fromEmail,
    message: payload.textBody,
    externalMessageId: payload.messageId,
  });
  logIngressDecision(ingressEval, channel.organization_id);

  if (ingressEval.decision === 'reject_spam') {
    emitSupportEvent({
      organizationId: channel.organization_id,
      eventType: 'ingress.spam_rejected',
      entityType: 'conversation',
      entityId: channel.organization_id,
      channelType: 'email',
      payload: {
        email: payload.fromEmail,
        score: ingressEval.spam?.score,
        signals: ingressEval.spam?.signals,
      },
    });
    return { status: 'spam_rejected', organizationId: channel.organization_id };
  }

  if (ingressEval.decision === 'suppress_duplicate' && ingressEval.duplicate) {
    emitSupportEvent({
      organizationId: channel.organization_id,
      eventType: 'ingress.duplicate_suppressed',
      entityType: 'conversation',
      entityId: ingressEval.duplicate.conversationId,
      channelType: 'email',
      payload: {
        message_id: ingressEval.duplicate.messageId,
        email: payload.fromEmail,
      },
    });
    return {
      status: 'duplicate',
      duplicate: {
        id: ingressEval.duplicate.messageId,
        conversation_id: ingressEval.duplicate.conversationId,
      },
      organizationId: channel.organization_id,
      reason: 'duplicate_content',
    };
  }

  const { customer } = await findOrCreateCustomer({
    organizationId: channel.organization_id,
    email: payload.fromEmail,
    name: payload.fromName || null,
  });
  console.log('customer', customer);
  const threadResult = await findOrCreateEmailThread({
    organizationId: channel.organization_id,
    customerId: customer.id,
    channelId: channel.id,
    inReplyTo: payload.inReplyTo,
    normalizedSubject: payload.normalizedSubject,
    messageId: payload.messageId,
    subject: payload.subject,
  });
  console.log('threadResult', threadResult);
  const reopenResult = await maybeReopenEmailThreadConversation({
    organizationId: channel.organization_id,
    conversation: threadResult.conversation,
    matchedBy: threadResult.matchedBy,
  });
  const conversation = reopenResult.conversation;
  const threadKeyForMetadata =
    threadResult.thread?.thread_key ||
    (typeof payload.inReplyTo === 'string' && payload.inReplyTo.trim()) ||
    (typeof payload.normalizedSubject === 'string' && payload.normalizedSubject.trim()) ||
    null;

  if (!threadResult.thread && payload.messageId) {
    await ensureEmailThread({
      organizationId: channel.organization_id,
      customerId: customer.id,
      conversationId: conversation.id,
      threadKey: payload.messageId,
      subject: payload.subject,
    });
  }

  const message = await createMessage({
    organizationId: channel.organization_id,
    conversationId: conversation.id,
    senderType: 'customer',
    senderUserId: null,
    senderMemberId: null,
    content: payload.textBody,
    metadata: {
      channel: 'email',
      external_message_id: payload.messageId || null,
      inbound_to_email: payload.toEmail,
      in_reply_to: payload.inReplyTo || null,
      thread_key: threadKeyForMetadata,
      integration_provider: integration.provider,
    },
  });

  await updateConversationLastMessageAt(conversation.id, channel.organization_id, message.created_at);

  const externalId = payload.messageId ? String(payload.messageId) : message.id;
  const ingressPost = await applyInboundIngressPostInsert({
    organizationId: channel.organization_id,
    conversationId: conversation.id,
    messageId: message.id,
    message: payload.textBody,
    evaluation: ingressEval,
  });

  if (!shouldSkipPostInboundAutomation(ingressEval) && !ingressPost.flagged) {
    scheduleInboundPostCustomerMessage({
      organizationId: channel.organization_id,
      conversationId: conversation.id,
      messageId: message.id,
    });
  }

  return {
    status: 'processed',
    organizationId: channel.organization_id,
    conversationId: conversation.id,
    messageId: message.id,
    threadId: threadResult.thread?.id ?? null,
    reopened: reopenResult.reopened,
  };
}
