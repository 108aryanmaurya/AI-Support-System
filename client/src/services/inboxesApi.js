/**
 * Org inbox CRUD (`/api/org/:orgId/inboxes/*`).
 */

function orgBase(organizationId) {
  return `/api/org/${encodeURIComponent(organizationId)}`
}

export function inboxesListUrl(organizationId) {
  return `${orgBase(organizationId)}/inboxes`
}

export function inboxUrl(organizationId, inboxId) {
  return `${orgBase(organizationId)}/inboxes/${encodeURIComponent(inboxId)}`
}

export function inboxMembersUrl(organizationId, inboxId) {
  return `${orgBase(organizationId)}/inboxes/${encodeURIComponent(inboxId)}/members`
}

export function transferInboxUrl(organizationId, conversationId) {
  return `${orgBase(organizationId)}/conversations/${encodeURIComponent(conversationId)}/transfer-inbox`
}

export async function fetchOrgInboxes(organizationId) {
  const { apiFetch } = await import('./api.js')
  return apiFetch(inboxesListUrl(organizationId))
}

export async function createOrgInbox(organizationId, body) {
  const { apiFetch } = await import('./api.js')
  return apiFetch(inboxesListUrl(organizationId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function patchOrgInbox(organizationId, inboxId, body) {
  const { apiFetch } = await import('./api.js')
  return apiFetch(inboxUrl(organizationId, inboxId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function replaceInboxMembers(organizationId, inboxId, memberIds, memberRoles = {}) {
  const { apiFetch } = await import('./api.js')
  return apiFetch(inboxMembersUrl(organizationId, inboxId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberIds, memberRoles }),
  })
}

export async function transferConversationInbox(organizationId, conversationId, targetInboxId, reason) {
  const { apiFetch } = await import('./api.js')
  return apiFetch(transferInboxUrl(organizationId, conversationId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_inbox_id: targetInboxId, reason }),
  })
}
