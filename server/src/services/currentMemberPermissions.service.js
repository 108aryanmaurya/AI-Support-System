import { deriveOrgCapabilitiesFromMemberPermissions } from '@ai-support/shared';
import { mergeOrganizationMemberPermissions } from './organizationMemberPermissions.service.js';
import { getOrganizationMemberById } from './org.service.js';

/**
 * Effective org capabilities + member profile for the authenticated user in this workspace.
 *
 * @param {string} organizationId
 * @param {string} membershipId — `organization_members.id`
 */
export async function getCurrentMemberPermissionsPayload(organizationId, membershipId) {
  const member = await getOrganizationMemberById(organizationId, membershipId);
  const memberPermissions = mergeOrganizationMemberPermissions(member.permissions);
  const permissions = deriveOrgCapabilitiesFromMemberPermissions(memberPermissions);

  return {
    membershipId: member.membershipId ?? member.id,
    role: member.role ?? null,
    memberPermissions,
    permissions,
  };
}
