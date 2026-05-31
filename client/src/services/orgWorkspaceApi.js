import { apiFetch } from './api.js'

export async function fetchOrgMembers(orgId) {
  return apiFetch(`/api/org/${orgId}/members`)
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
