import { hasOrgPermission, mergeOrgPermissions, permissionsForRole } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

/**
 * @param {string} organizationId
 */
async function loadOrgSettings(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load organization settings.');
  }
  if (!data) {
    throw new HttpError(404, 'Organization not found.');
  }
  return data.settings && typeof data.settings === 'object' ? data.settings : {};
}

/**
 * Effective permissions for a member (role preset ⊕ org overrides).
 *
 * @param {string} organizationId
 * @param {{ role?: string | null }} membership
 */
export async function getOrgPermissionsForMember(organizationId, membership) {
  const role = membership?.role ?? 'AGENT';
  const preset = permissionsForRole(role);
  const settings = await loadOrgSettings(organizationId);
  const overrides =
    settings.permissions && typeof settings.permissions === 'object'
      ? settings.permissions
      : {};
  return mergeOrgPermissions(overrides, preset);
}

/**
 * @param {string} organizationId
 * @param {{ role?: string | null }} membership
 * @param {string} permissionKey
 */
export async function assertOrgPermission(organizationId, membership, permissionKey) {
  const permissions = await getOrgPermissionsForMember(organizationId, membership);
  if (!hasOrgPermission(permissions, permissionKey)) {
    throw new HttpError(403, 'Insufficient permissions for this action.');
  }
  return permissions;
}
