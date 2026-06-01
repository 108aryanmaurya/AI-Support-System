import { hasOrgPermission } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { getOrgPermissionsForMember } from './orgPermissions.service.js';

/**
 * Inbox ids the member may access (member of inbox, or ADMIN with view_all_inboxes).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {object} params.membership — organization_members row
 * @param {object} [params.orgPermissions]
 * @returns {Promise<{ inboxIds: string[], viewAll: boolean }>}
 */
export async function listAccessibleInboxIds({ organizationId, membership, orgPermissions }) {
  const permissions =
    orgPermissions ?? (await getOrgPermissionsForMember(organizationId, membership));
  const viewAll = hasOrgPermission(permissions, 'conversations.view_all_inboxes');

  if (viewAll) {
    const { data, error } = await supabaseAdmin
      .from('inboxes')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('status', 'active');
    if (error) {
      const missing = error.message?.includes('inboxes') || error.code === '42P01';
      if (missing) return { inboxIds: [], viewAll: true };
      throw new HttpError(500, error.message || 'Failed to list inboxes.');
    }
    return { inboxIds: (data ?? []).map((r) => r.id), viewAll: true };
  }

  const { data, error } = await supabaseAdmin
    .from('inbox_members')
    .select('inbox_id, inboxes!inner(organization_id, status)')
    .eq('organization_member_id', membership.id);

  if (error) {
    const missing = error.message?.includes('inbox_members') || error.code === '42P01';
    if (missing) return { inboxIds: [], viewAll: false };
    throw new HttpError(500, error.message || 'Failed to list inbox membership.');
  }

  const inboxIds = [];
  for (const row of data ?? []) {
    const ib = row.inboxes;
    if (ib?.organization_id === organizationId && ib?.status === 'active') {
      inboxIds.push(row.inbox_id);
    }
  }
  return { inboxIds, viewAll: false };
}

/**
 * @param {string} inboxId
 * @param {string[]} accessibleInboxIds
 * @param {boolean} viewAll
 */
export function canAccessInboxId(inboxId, accessibleInboxIds, viewAll) {
  if (viewAll) return true;
  return accessibleInboxIds.includes(inboxId);
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {object} params.membership
 * @param {object} [params.orgPermissions]
 */
export async function assertCanAccessConversation({
  organizationId,
  conversationId,
  membership,
  orgPermissions,
}) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, inbox_id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load conversation.');
  if (!data) throw new HttpError(404, 'Conversation not found in this organization.');

  const { inboxIds, viewAll } = await listAccessibleInboxIds({
    organizationId,
    membership,
    orgPermissions,
  });

  if (!data.inbox_id) {
    return data;
  }
  if (!canAccessInboxId(data.inbox_id, inboxIds, viewAll)) {
    throw new HttpError(403, 'You do not have access to this inbox.');
  }
  return data;
}

/**
 * Resolve and validate inboxId for list queries.
 * @param {object} params
 * @param {string | null} params.inboxId — query param
 * @param {string} params.organizationId
 * @param {object} params.membership
 * @param {object} [params.orgPermissions]
 */
export async function resolveListInboxId({ inboxId, organizationId, membership, orgPermissions }) {
  const { inboxIds, viewAll } = await listAccessibleInboxIds({
    organizationId,
    membership,
    orgPermissions,
  });

  if (inboxId) {
    if (!canAccessInboxId(inboxId, inboxIds, viewAll)) {
      throw new HttpError(403, 'You do not have access to this inbox.');
    }
    return inboxId;
  }

  if (inboxIds.length === 0) {
    throw new HttpError(403, 'You are not a member of any inbox.');
  }
  if (inboxIds.length === 1) return inboxIds[0];
  return inboxIds[0];
}
