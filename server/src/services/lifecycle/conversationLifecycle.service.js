import {
  CONVERSATION_ACTIVE_STATUSES,
  CONVERSATION_TERMINAL_STATUSES,
  isConversationTerminalStatus,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { createMessage } from '../support.service.js';
import { updateConversationFromAutomation } from '../conversationUpdate.service.js';
import { getOrgLifecycleSettings } from './lifecycleSettings.service.js';
import {
  evaluateEmailThreadReopenDecision,
  isActiveConversationStatus,
  isTerminalStatus,
  shouldReopenConversation,
} from './conversationLifecycle.rules.js';

export {
  evaluateEmailThreadReopenDecision,
  isTerminalStatus,
  isActiveConversationStatus,
  shouldReopenConversation,
};

/**
 * Reopen a terminal conversation to `open`, clear close/resolve fields, optional system note.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.reason — e.g. `customer_reply_email`
 * @param {'email'|'web'} [params.channel]
 * @param {boolean} [params.addSystemMessage=true]
 * @returns {Promise<object>} updated conversation row
 */
export async function reopenConversation({
  organizationId,
  conversationId,
  reason,
  channel = null,
  addSystemMessage = true,
}) {
  const { data: prior, error: priorErr } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (priorErr) {
    throw new HttpError(500, priorErr.message || 'Failed to load conversation for reopen.');
  }
  if (!prior) {
    throw new HttpError(404, 'Conversation not found in this organization.');
  }
  if (!isConversationTerminalStatus(prior.status)) {
    return prior;
  }

  const { conversation: updated } = await updateConversationFromAutomation({
    organizationId,
    conversationId,
    status: 'open',
    workflowMeta: {
      lifecycle: {
        reopen_reason: reason,
        channel,
        prior_status: prior.status,
      },
    },
  });

  const priorMeta = prior.metadata && typeof prior.metadata === 'object' ? { ...prior.metadata } : {};
  const priorLifecycle =
    priorMeta.lifecycle && typeof priorMeta.lifecycle === 'object' ? { ...priorMeta.lifecycle } : {};
  priorMeta.lifecycle = {
    ...priorLifecycle,
    reopened_at: new Date().toISOString(),
    reopen_reason: reason ?? null,
    prior_status: prior.status,
    channel: channel ?? null,
  };

  const { data: cleared, error: clearErr } = await supabaseAdmin
    .from('conversations')
    .update({
      closed_at: null,
      closed_reason: null,
      resolved_at: null,
      resolved_by_member_id: null,
      customer_reminder_sent_at: null,
      waiting_status: '',
      metadata: priorMeta,
    })
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle();

  if (clearErr) {
    throw new HttpError(500, clearErr.message || 'Failed to clear lifecycle fields on reopen.');
  }

  const row = cleared ?? updated;

  if (addSystemMessage) {
    const label =
      channel === 'email'
        ? 'Customer replied by email'
        : channel === 'web'
          ? 'Customer sent a new message'
          : 'Customer replied';
    await createMessage({
      organizationId,
      conversationId,
      senderType: 'system',
      senderUserId: null,
      senderMemberId: null,
      content: `${label}; conversation reopened.`,
      metadata: {
        lifecycle: {
          event: 'reopened',
          reason: reason ?? null,
          channel,
        },
      },
    });
  }

  return row;
}

/**
 * After email thread resolution: reopen terminal conversation when Model C applies.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {object} params.conversation
 * @param {string|null} params.matchedBy — from `findOrCreateEmailThread`
 * @returns {Promise<{ conversation: object, reopened: boolean }>}
 */
export async function maybeReopenEmailThreadConversation({
  organizationId,
  conversation,
  matchedBy,
}) {
  const lifecycle = await getOrgLifecycleSettings(organizationId);
  const decision = evaluateEmailThreadReopenDecision({
    conversation,
    matchedBy,
    orgSettings: lifecycle,
  });

  if (!decision.shouldReopen) {
    return { conversation, reopened: false };
  }

  const reopenedRow = await reopenConversation({
    organizationId,
    conversationId: conversation.id,
    reason: 'customer_reply_email',
    channel: 'email',
  });

  return { conversation: reopenedRow, reopened: true };
}

/**
 * @param {string} organizationId
 * @param {string} customerId
 * @returns {Promise<object|null>}
 */
export async function findActiveWebConversation({ organizationId, customerId }) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId)
    .eq('channel_type', 'web')
    .in('status', [...CONVERSATION_ACTIVE_STATUSES])
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load active web conversation.');
  }
  return data ?? null;
}

/**
 * Latest terminal web conversation for a customer (reopen candidate).
 *
 * @param {string} organizationId
 * @param {string} customerId
 * @returns {Promise<object|null>}
 */
export async function findLatestTerminalWebConversation({ organizationId, customerId }) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId)
    .eq('channel_type', 'web')
    .in('status', [...CONVERSATION_TERMINAL_STATUSES])
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load terminal web conversation.');
  }
  return data ?? null;
}
