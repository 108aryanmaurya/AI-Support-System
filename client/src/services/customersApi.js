import { apiFetch } from './api.js'

export function orgCustomersUrl(organizationId, params = {}) {
  const url = new URL(`/api/org/${encodeURIComponent(organizationId)}/customers`, window.location.origin)
  if (params?.query) url.searchParams.set('query', params.query)
  if (params?.limit) url.searchParams.set('limit', String(params.limit))
  return `${url.pathname}${url.search}`
}

export function fetchOrgCustomers(organizationId, opts = {}) {
  return apiFetch(orgCustomersUrl(organizationId, opts))
}

export function createOrgCustomer(organizationId, body) {
  return apiFetch(`/api/org/${encodeURIComponent(organizationId)}/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
}

