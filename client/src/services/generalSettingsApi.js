import { apiFetch } from './api.js'

export function fetchOrgGeneralSettings(orgId) {
  return apiFetch(`/api/org/${encodeURIComponent(orgId)}/settings/general`)
}

/**
 * @param {string} orgId
 * @param {{ name?: string, general?: { timezone?: string, disable_team_mentions_in_notes?: boolean, hide_csat_scores_from_agents?: boolean }, timezone?: string, disable_team_mentions_in_notes?: boolean, hide_csat_scores_from_agents?: boolean }} body
 */
export function patchOrgGeneralSettings(orgId, body) {
  return apiFetch(`/api/org/${encodeURIComponent(orgId)}/settings/general`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function postOrgGeneralDeletionRequest(orgId, confirmFullName) {
  return apiFetch(`/api/org/${encodeURIComponent(orgId)}/settings/general/request-deletion`, {
    method: 'POST',
    body: JSON.stringify({ confirmFullName }),
  })
}
