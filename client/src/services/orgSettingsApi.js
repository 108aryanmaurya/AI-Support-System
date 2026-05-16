import { apiFetch } from './api.js'

export function orgSettingsAiUrl(organizationId) {
  return `/api/org/${encodeURIComponent(organizationId)}/settings/ai`
}

export function fetchOrgAiSettings(organizationId) {
  return apiFetch(orgSettingsAiUrl(organizationId))
}

export function patchOrgAiSettings(organizationId, body) {
  return apiFetch(orgSettingsAiUrl(organizationId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
