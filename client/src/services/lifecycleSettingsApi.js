import { apiFetch } from './api.js';

/**
 * @param {string} organizationId
 */
export function fetchOrgLifecycleSettings(organizationId) {
  return apiFetch(`/api/org/${encodeURIComponent(organizationId)}/settings/lifecycle`);
}

/**
 * @param {string} organizationId
 * @param {object} lifecycle — partial lifecycle settings
 */
export function patchOrgLifecycleSettings(organizationId, lifecycle) {
  return apiFetch(`/api/org/${encodeURIComponent(organizationId)}/settings/lifecycle`, {
    method: 'PATCH',
    body: JSON.stringify({ lifecycle }),
  });
}
