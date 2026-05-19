import { apiFetch } from './api.js'

function tagsBase(organizationId) {
  return `/api/org/${encodeURIComponent(organizationId)}/tags`
}

export function fetchOrgTags(organizationId) {
  return apiFetch(tagsBase(organizationId))
}

export function createOrgTag(organizationId, { name, color }) {
  return apiFetch(tagsBase(organizationId), {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  })
}

export function patchOrgTag(organizationId, tagId, { name, color }) {
  return apiFetch(`${tagsBase(organizationId)}/${encodeURIComponent(tagId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, color }),
  })
}

export function deleteOrgTag(organizationId, tagId) {
  return apiFetch(`${tagsBase(organizationId)}/${encodeURIComponent(tagId)}`, {
    method: 'DELETE',
  })
}

export function fetchConversationTags(organizationId, conversationId) {
  return apiFetch(
    `${tagsBase(organizationId)}/conversations/${encodeURIComponent(conversationId)}`,
  )
}

export function setConversationTags(organizationId, conversationId, tagIds) {
  return apiFetch(
    `${tagsBase(organizationId)}/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'PUT', body: JSON.stringify({ tagIds }) },
  )
}
