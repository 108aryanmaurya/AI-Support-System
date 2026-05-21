import { apiFetch } from './api.js'

function workflowsBase(organizationId) {
  return `/api/org/${encodeURIComponent(organizationId)}/ai/workflows`
}

export function fetchWorkflowRules(organizationId) {
  return apiFetch(`${workflowsBase(organizationId)}/rules`)
}

/**
 * @param {string} organizationId
 * @param {{ rules: object[], schedule?: object }} body
 */
export function saveWorkflowRules(organizationId, body) {
  return apiFetch(`${workflowsBase(organizationId)}/rules`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/**
 * @param {string} organizationId
 * @param {{ days?: number }} [opts]
 */
export function fetchWorkflowMetrics(organizationId, opts = {}) {
  const params = new URLSearchParams()
  if (opts.days) params.set('days', String(opts.days))
  const q = params.toString()
  return apiFetch(`${workflowsBase(organizationId)}/metrics${q ? `?${q}` : ''}`)
}

/**
 * @param {string} organizationId
 * @param {object} body
 */
export function dryRunWorkflow(organizationId, body) {
  return apiFetch(`${workflowsBase(organizationId)}/dry-run`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function sendWorkflowTestNotification(organizationId) {
  return apiFetch(`${workflowsBase(organizationId)}/test-notification`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
