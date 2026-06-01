import { deriveOrgCapabilitiesFromMemberPermissions, hasOrgPermission } from '@ai-support/shared';
import { HttpError } from '../utils/httpError.js';
import { getOrganizationMemberPermissions } from './organizationMemberPermissions.service.js';

/**
 * Effective org capabilities for a member from `organization_members.permissions`.
 *
 * @param {string} organizationId
 * @param {{ id?: string | null, role?: string | null }} membership
 */
export async function getOrgPermissionsForMember(_organizationId, membership) {
  const memberId = membership?.id;
  if (!memberId) {
    return deriveOrgCapabilitiesFromMemberPermissions(null);
  }

  try {
    const memberPermissions = await getOrganizationMemberPermissions(memberId);
    return deriveOrgCapabilitiesFromMemberPermissions(memberPermissions);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      throw new HttpError(403, 'You do not have access to this organization.');
    }
    throw e;
  }
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
