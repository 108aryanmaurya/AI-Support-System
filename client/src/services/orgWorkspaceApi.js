import { apiFetch } from './api.js'

export async function fetchOrgMembers(orgId) {
  return apiFetch(`/api/org/${orgId}/members`)
}

export async function fetchOrgMember(orgId, memberId) {
  return apiFetch(`/api/org/${orgId}/members/${encodeURIComponent(memberId)}`)
}

export async function fetchTeammateProfile(orgId, memberId) {
  return apiFetch(`/api/org/${orgId}/members/${encodeURIComponent(memberId)}/profile`)
}

/**
 * @param {string} orgId
 * @param {string} memberId
 * @param {{ firstName?: string, lastName?: string, jobTitle?: string, profile?: object }} body
 */
export async function patchTeammateProfile(orgId, memberId, body) {
  return apiFetch(`/api/org/${orgId}/members/${encodeURIComponent(memberId)}/profile`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/**
 * @param {string} orgId
 * @param {string} memberId
 * @param {{ permissions: object }} body
 */
export async function patchOrgMemberPermissions(orgId, memberId, body) {
  return apiFetch(`/api/org/${orgId}/members/${encodeURIComponent(memberId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteOrgMember(orgId, memberId) {
  return apiFetch(`/api/org/${orgId}/members/${encodeURIComponent(memberId)}`, {
    method: 'DELETE',
  })
}

export async function fetchOrgPendingInvites(orgId) {
  return apiFetch(`/api/org/${orgId}/invites`)
}

export async function fetchOrgChannels(orgId) {
  return apiFetch(`/api/org/${orgId}/channels`)
}

/**
 * @param {string} orgId
 * @param {{ emails: string[], role?: string, inboxIds?: string[], inboxId?: string | null, permissions?: object }} body
 *   inboxIds — when the org has team inboxes, pass one or more UUIDs; omit or [] if none exist yet
 *   inboxId — legacy single inbox (treated as one-element inboxIds)
 *   permissions — merged inbox member permissions (see shared/inboxMemberPermissions.js)
 */
export async function postOrgInvitesBatch(orgId, body) {
  return apiFetch(`/api/org/${orgId}/invites/batch`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function fetchOrgTeammatePermissionRoles(orgId) {
  return apiFetch(`/api/org/${orgId}/teammate-permission-roles`)
}

/**
 * @param {string} orgId
 * @param {{ name: string, description: string, permissions: object }} body
 */
export async function createOrgTeammatePermissionRole(orgId, body) {
  return apiFetch(`/api/org/${orgId}/teammate-permission-roles`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * @param {string} orgId
 * @param {string} roleId
 * @param {{ name?: string, description?: string, permissions?: object }} body
 */
export async function updateOrgTeammatePermissionRole(orgId, roleId, body) {
  return apiFetch(`/api/org/${orgId}/teammate-permission-roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteOrgTeammatePermissionRole(orgId, roleId) {
  return apiFetch(`/api/org/${orgId}/teammate-permission-roles/${roleId}`, {
    method: 'DELETE',
  })
}
