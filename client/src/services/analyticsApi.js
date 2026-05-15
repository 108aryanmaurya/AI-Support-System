import { apiFetch } from './api.js'

function orgAnalyticsBase(organizationId) {
  return `/api/org/${encodeURIComponent(organizationId)}/analytics`
}

function withRange(path, { from, to } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const q = params.toString()
  return q ? `${path}?${q}` : path
}

export function defaultReportRange() {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 6)
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(to) }
}

export function fetchAnalyticsOverview(organizationId, range) {
  return apiFetch(withRange(`${orgAnalyticsBase(organizationId)}/overview`, range))
}

export function fetchAnalyticsConversations(organizationId, range) {
  return apiFetch(withRange(`${orgAnalyticsBase(organizationId)}/conversations`, range))
}

export function fetchAnalyticsTeam(organizationId, range) {
  return apiFetch(withRange(`${orgAnalyticsBase(organizationId)}/team`, range))
}

export function fetchAnalyticsAi(organizationId, range) {
  return apiFetch(withRange(`${orgAnalyticsBase(organizationId)}/ai`, range))
}
