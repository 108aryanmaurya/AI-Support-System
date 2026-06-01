import { mergeInboxMemberPermissions } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

/**
 * @param {unknown} raw
 */
export function mergeOrganizationMemberPermissions(raw) {
  return mergeInboxMemberPermissions(raw);
}

/**
 * @param {string} organizationMemberId
 */
export async function getOrganizationMemberPermissions(organizationMemberId) {
  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('permissions')
    .eq('id', organizationMemberId)
    .maybeSingle();

  if (error) {
    const msg = typeof error.message === 'string' ? error.message : '';
    if (msg.includes('permissions') && msg.includes('schema cache')) {
      throw new HttpError(
        503,
        'Database migration required: run supabase/migrations/20260601140000_organization_members_permissions.sql',
      );
    }
    throw new HttpError(500, error.message || 'Failed to load member permissions.');
  }
  if (!data) return mergeOrganizationMemberPermissions(null);
  return mergeOrganizationMemberPermissions(data.permissions);
}

/**
 * @param {string} organizationMemberId
 * @param {unknown} permissions
 */
export async function setOrganizationMemberPermissions(organizationMemberId, permissions) {
  const merged = mergeOrganizationMemberPermissions(permissions);
  const { error } = await supabaseAdmin
    .from('organization_members')
    .update({ permissions: merged })
    .eq('id', organizationMemberId);

  if (error) {
    const msg = typeof error.message === 'string' ? error.message : '';
    if (msg.includes('permissions') && msg.includes('schema cache')) {
      throw new HttpError(
        503,
        'Database migration required: run supabase/migrations/20260601140000_organization_members_permissions.sql',
      );
    }
    throw new HttpError(500, error.message || 'Failed to save member permissions.');
  }
  return merged;
}

/**
 * @param {string[]} organizationMemberIds
 * @returns {Promise<Map<string, object>>}
 */
export async function loadOrganizationMemberPermissionsMap(organizationMemberIds) {
  const ids = [...new Set(organizationMemberIds.filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;

  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('id, permissions')
    .in('id', ids);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load member permissions.');
  }

  for (const row of data ?? []) {
    map.set(row.id, mergeOrganizationMemberPermissions(row.permissions));
  }
  return map;
}
