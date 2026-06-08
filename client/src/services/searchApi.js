import { apiFetch } from './api.js'

function searchBase(organizationId) {
  return `/api/org/${encodeURIComponent(organizationId)}/search`
}

/**
 * Structured inbox search (S1 — filters + basic text match, no FTS).
 * @param {string} organizationId
 * @param {object} [params]
 */
export function searchWorkspace(organizationId, params = {}) {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.status) qs.set('status', params.status)
  if (params.priority) qs.set('priority', params.priority)
  if (params.assignee) qs.set('assignee', params.assignee)
  if (params.channel) qs.set('channel', params.channel)
  if (params.tag) qs.set('tag', params.tag)
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom)
  if (params.dateTo) qs.set('dateTo', params.dateTo)
  if (params.entityType) qs.set('entityType', params.entityType)
  if (params.page != null) qs.set('page', String(params.page))
  if (params.pageSize != null) qs.set('pageSize', String(params.pageSize))
  const query = qs.toString()
  return apiFetch(`${searchBase(organizationId)}${query ? `?${query}` : ''}`)
}
