import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { createMessage, findOrCreateCustomer } from '../support.service.js';
import { touchLastCustomerMessageAt } from './lifecycleMessageTimestamps.service.js';
import {
  findActiveWebConversation,
  findLatestTerminalWebConversation,
  reopenConversation,
  shouldReopenConversation,
} from './conversationLifecycle.service.js';
import { getOrgLifecycleSettings } from './lifecycleSettings.service.js';

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string|null} params.idempotencyKey
 * @returns {Promise<{ conversationId: string, messageId: string }|null>}
 */
export async function findIncomingIdempotency({ organizationId, idempotencyKey }) {
  const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  if (!key) return null;

  const { data, error } = await supabaseAdmin
    .from('incoming_message_idempotency')
    .select('conversation_id, message_id')
    .eq('organization_id', organizationId)
    .eq('idempotency_key', key)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to check inbound idempotency.');
  }
  if (!data?.conversation_id || !data?.message_id) return null;
  return { conversationId: data.conversation_id, messageId: data.message_id };
}

/**
 * @param {object} params
 */
async function recordIncomingIdempotency({
  organizationId,
  idempotencyKey,
  conversationId,
  messageId,
}) {
  const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  if (!key) return;

  const { error } = await supabaseAdmin.from('incoming_message_idempotency').upsert(
    {
      organization_id: organizationId,
      idempotency_key: key,
      conversation_id: conversationId,
      message_id: messageId,
    },
    { onConflict: 'organization_id,idempotency_key' },
  );

  if (error) {
    throw new HttpError(500, error.message || 'Failed to store inbound idempotency.');
  }
}

/**
 * @param {object} params
 */
async function appendCustomerWebMessage({
  organizationId,
  conversationId,
  content,
  idempotencyKey,
}) {
  const message = await createMessage({
    organizationId,
    conversationId,
    senderType: 'customer',
    senderUserId: null,
    senderMemberId: null,
    content,
    metadata: { channel: 'web' },
  });

  const timestamp = message.created_at ?? new Date().toISOString();
  const { error: touchErr } = await supabaseAdmin
    .from('conversations')
    .update({
      last_message_at: timestamp,
      last_customer_message_at: timestamp,
      customer_reminder_sent_at: null,
    })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (touchErr) {
    throw new HttpError(500, touchErr.message || 'Failed to update conversation activity.');
  }

  await recordIncomingIdempotency({
    organizationId,
    idempotencyKey,
    conversationId,
    messageId: message.id,
  });

  return { conversationId, messageId: message.id };
}

/**
 * Model C web ingress: active reuse, optional terminal reopen, else new conversation.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.email — normalized
 * @param {string} params.message — sanitized
 * @param {string|null} params.idempotencyKey
 * @returns {Promise<{ conversationId: string, messageId: string, reopened?: boolean, createdConversation?: boolean }>}
 */
export async function processInboundWebMessage({
  organizationId,
  email,
  message,
  idempotencyKey = null,
}) {
  const existing = await findIncomingIdempotency({ organizationId, idempotencyKey });
  if (existing) {
    return existing;
  }

  const { customer } = await findOrCreateCustomer({
    organizationId,
    email,
    name: null,
  });

  const lifecycle = await getOrgLifecycleSettings(organizationId);

  const active = await findActiveWebConversation({
    organizationId,
    customerId: customer.id,
  });
  if (active) {
    const result = await appendCustomerWebMessage({
      organizationId,
      conversationId: active.id,
      content: message,
      idempotencyKey,
    });
    return { ...result, reopened: false, createdConversation: false };
  }

  const terminal = await findLatestTerminalWebConversation({
    organizationId,
    customerId: customer.id,
  });

  if (
    terminal &&
    shouldReopenConversation({
      conversation: terminal,
      channel: 'web',
      payload: {},
      orgSettings: lifecycle,
    })
  ) {
    await reopenConversation({
      organizationId,
      conversationId: terminal.id,
      reason: 'customer_reply_web',
      channel: 'web',
    });
    const result = await appendCustomerWebMessage({
      organizationId,
      conversationId: terminal.id,
      content: message,
      idempotencyKey,
    });
    return { ...result, reopened: true, createdConversation: false };
  }

  const { data, error } = await supabaseAdmin.rpc('handle_incoming_message', {
    p_organization_id: organizationId,
    p_email: email,
    p_message: message,
    p_idempotency_key: typeof idempotencyKey === 'string' ? idempotencyKey.trim() : null,
  });

  if (error) {
    throw new HttpError(500, error.message || 'Failed to process incoming message.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.conversation_id || !row?.message_id) {
    throw new HttpError(500, 'Failed to process incoming message.');
  }

  await touchLastCustomerMessageAt({
    organizationId,
    conversationId: row.conversation_id,
  });

  return {
    conversationId: row.conversation_id,
    messageId: row.message_id,
    reopened: false,
    createdConversation: true,
  };
}
