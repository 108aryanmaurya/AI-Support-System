import { isConversationTerminalStatus } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { getOrgLifecycleSettings } from './lifecycleSettings.service.js';

const SKIP_WAITING_PATCH_STATUSES = new Set(['spam']);

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} [params.at] — ISO timestamp
 */
export async function touchLastCustomerMessageAt({ organizationId, conversationId, at }) {
  const timestamp = at ?? new Date().toISOString();

  const { data: row, error: loadErr } = await supabaseAdmin
    .from('conversations')
    .select('id, status, waiting_status')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (loadErr) {
    throw new HttpError(500, loadErr.message || 'Failed to load conversation for customer touch.');
  }
  if (!row) {
    throw new HttpError(404, 'Conversation not found in this organization.');
  }

  const lifecycle = await getOrgLifecycleSettings(organizationId);
  const priorStatus = row.status ?? 'open';

  /** @type {Record<string, unknown>} */
  const patch = {
    last_customer_message_at: timestamp,
    customer_reminder_sent_at: null,
  };

  if (
    lifecycle.set_waiting_agent_on_customer_reply !== false &&
    !isConversationTerminalStatus(priorStatus) &&
    !SKIP_WAITING_PATCH_STATUSES.has(priorStatus)
  ) {
    patch.waiting_status = 'waiting_agent';
  }

  const { error } = await supabaseAdmin
    .from('conversations')
    .update(patch)
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to update last customer message time.');
  }
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} [params.at]
 */
export async function touchLastAgentMessageAt({ organizationId, conversationId, at }) {
  const timestamp = at ?? new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ last_agent_message_at: timestamp })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to update last agent message time.');
  }
}

/**
 * After a successful agent/AI outbound: stamp `last_agent_message_at` and optionally `waiting_status`.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {object} [params.conversation] — row with `status`, `waiting_status` (loaded if omitted)
 * @param {string} [params.at]
 * @returns {Promise<{ statusChanged: boolean, waitingStatus: string }>}
 */
export async function applyAgentOutboundLifecycle({
  organizationId,
  conversationId,
  conversation = null,
  at,
}) {
  const timestamp = at ?? new Date().toISOString();

  let row = conversation;
  if (!row) {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('id, status, waiting_status')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) {
      throw new HttpError(500, error.message || 'Failed to load conversation for lifecycle.');
    }
    if (!data) {
      throw new HttpError(404, 'Conversation not found in this organization.');
    }
    row = data;
  }

  const lifecycle = await getOrgLifecycleSettings(organizationId);
  const priorStatus = row.status ?? 'open';
  const priorWaiting = row.waiting_status ?? '';

  /** @type {Record<string, unknown>} */
  const patch = { last_agent_message_at: timestamp };

  const skipWaiting =
    isConversationTerminalStatus(priorStatus) || SKIP_WAITING_PATCH_STATUSES.has(priorStatus);

  if (
    lifecycle.set_waiting_customer_on_agent_reply &&
    !skipWaiting &&
    priorWaiting !== 'waiting_customer'
  ) {
    patch.waiting_status = 'waiting_customer';
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('conversations')
    .update(patch)
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .select('status, waiting_status')
    .maybeSingle();

  if (updateErr) {
    throw new HttpError(500, updateErr.message || 'Failed to apply agent outbound lifecycle.');
  }

  const nextWaiting = updated?.waiting_status ?? priorWaiting;

  return {
    statusChanged: nextWaiting !== priorWaiting,
    waitingStatus: nextWaiting,
  };
}
