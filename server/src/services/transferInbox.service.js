import { INBOX_LIMITS, hasOrgPermission, isInboxMemberRole } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { emitSupportEvent } from './analytics/supportEvents.service.js';
import { assertCanAccessConversation } from './inboxAccess.service.js';
import { getOrgPermissionsForMember } from './orgPermissions.service.js';

/**
 * Manual inbox transfer (v1 keeps assignee).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.targetInboxId
 * @param {string} [params.reason]
 * @param {object} params.membership
 * @param {string} params.actorUserId
 * @param {string} [params.idempotencyKey]
 */
export async function transferConversationInbox({
  organizationId,
  conversationId,
  targetInboxId,
  reason = null,
  membership,
  actorUserId,
  idempotencyKey = null,
}) {
  const permissions = await getOrgPermissionsForMember(organizationId, membership);

  const prior = await assertCanAccessConversation({
    organizationId,
    conversationId,
    membership,
    orgPermissions: permissions,
  });

  const canTransfer =
    hasOrgPermission(permissions, 'conversations.transfer_inbox') ||
    (await isInboxLeadForConversation({
      inboxId: prior.inbox_id,
      membership,
      organizationId,
      conversationId,
    }));

  if (!canTransfer) {
    throw new HttpError(403, 'You cannot transfer conversations between inboxes.');
  }

  if (prior.inbox_id === targetInboxId) {
    return { conversation: prior, transferred: false };
  }

  const { data: target, error: targetErr } = await supabaseAdmin
    .from('inboxes')
    .select('id, status, organization_id')
    .eq('id', targetInboxId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (targetErr) throw new HttpError(500, targetErr.message || 'Failed to load target inbox.');
  if (!target) throw new HttpError(400, 'Target inbox not found.');
  if (target.status !== 'active') {
    throw new HttpError(400, 'Cannot transfer to an archived inbox.');
  }

  const reasonTrimmed =
    typeof reason === 'string' && reason.trim()
      ? reason.trim().slice(0, INBOX_LIMITS.maxTransferReasonLength)
      : null;

  if (idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from('support_events')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('entity_type', 'conversation')
      .eq('entity_id', conversationId)
      .eq('event_type', 'conversation.inbox_transferred')
      .contains('payload', {
        idempotency_key: idempotencyKey,
        to_inbox_id: targetInboxId,
      })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      const { data: conv } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
      return { conversation: conv, transferred: false, idempotent: true };
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('conversations')
    .update({ inbox_id: targetInboxId })
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to transfer conversation.');

  emitSupportEvent({
    organizationId,
    eventType: 'conversation.inbox_transferred',
    entityType: 'conversation',
    entityId: conversationId,
    actorMemberId: membership.id,
    payload: {
      from_inbox_id: prior.inbox_id,
      to_inbox_id: targetInboxId,
      actor_user_id: actorUserId,
      reason: reasonTrimmed,
      idempotency_key: idempotencyKey ?? null,
    },
  });

  console.info(
    JSON.stringify({
      event: 'conversation.inbox_transferred',
      organization_id: organizationId,
      conversation_id: conversationId,
      from_inbox_id: prior.inbox_id,
      to_inbox_id: targetInboxId,
    }),
  );

  return { conversation: updated, transferred: true };
}

async function isInboxLeadForConversation({ inboxId, membership, organizationId, conversationId }) {
  let resolvedInboxId = inboxId;
  if (!resolvedInboxId) {
    const { data } = await supabaseAdmin
      .from('conversations')
      .select('inbox_id')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    resolvedInboxId = data?.inbox_id ?? null;
  }
  if (!resolvedInboxId) return false;

  const { data, error } = await supabaseAdmin
    .from('inbox_members')
    .select('role')
    .eq('inbox_id', resolvedInboxId)
    .eq('organization_member_id', membership.id)
    .maybeSingle();

  if (error) return false;
  return data?.role === 'lead';
}

export { isInboxMemberRole };
