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
 * @param {{ emails: string[], role?: string, inboxId?: string | null }} body
 *   inboxId — team inbox UUID; omit or null for org default inbox on accept
 */
export async function postOrgInvitesBatch(orgId, body) {
  return apiFetch(`/api/org/${orgId}/invites/batch`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
