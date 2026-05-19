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

/**
 * @param {string} organizationId
 * @param {object} range
 * @param {object} [opts]
 * @param {number} [opts.page]
 * @param {number} [opts.pageSize]
 * @param {string} [opts.feature]
 * @param {string} [opts.status]
 */
export function fetchAnalyticsAiRuns(organizationId, range, opts = {}) {
  const params = new URLSearchParams()
  if (range?.from) params.set('from', range.from)
  if (range?.to) params.set('to', range.to)
  if (opts.page) params.set('page', String(opts.page))
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize))
  if (opts.feature) params.set('feature', opts.feature)
  if (opts.status) params.set('status', opts.status)
  const q = params.toString()
  const path = `${orgAnalyticsBase(organizationId)}/ai/runs${q ? `?${q}` : ''}`
  return apiFetch(path)
}

export function fetchAnalyticsKnowledge(organizationId, range) {
  return apiFetch(withRange(`${orgAnalyticsBase(organizationId)}/knowledge`, range))
}
