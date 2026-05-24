import { apiFetch } from './api.js';

function orgBase(organizationId) {
  return `/api/org/${encodeURIComponent(organizationId)}/assignment`;
}

/**
 * @param {string} organizationId
 * @param {{ presence?: 'online' | 'available' | 'away' | 'busy' }} [body]
 */
export function postAgentPresenceHeartbeat(organizationId, body = {}) {
  return apiFetch(`${orgBase(organizationId)}/presence/heartbeat`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * @param {string} organizationId
 */
export function postAgentPresenceOffline(organizationId) {
  return apiFetch(`${orgBase(organizationId)}/presence/offline`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * @param {string} organizationId
 */
export function fetchOrgAssignmentSettings(organizationId) {
  return apiFetch(`${orgBase(organizationId)}/settings`);
}

/**
 * @param {string} organizationId
 * @param {{ days?: number }} [opts]
 */
export function fetchAssignmentMetrics(organizationId, opts = {}) {
  const days = opts.days != null ? Number(opts.days) : null;
  const q = Number.isFinite(days) ? `?days=${encodeURIComponent(String(days))}` : '';
  return apiFetch(`${orgBase(organizationId)}/metrics${q}`);
}

/**
 * @param {string} organizationId
 * @param {object} assignment — partial assignment settings patch
 */
export function putOrgAssignmentSettings(organizationId, assignment) {
  return apiFetch(`${orgBase(organizationId)}/settings`, {
    method: 'PUT',
    body: JSON.stringify(assignment),
  });
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 */
export function fetchAgentAssignmentConfig(organizationId, memberId) {
  return apiFetch(`${orgBase(organizationId)}/agents/${encodeURIComponent(memberId)}`);
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 * @param {{ profile?: object, skills?: object[] }} body
 */
export function putAgentAssignmentConfig(organizationId, memberId, body) {
  return apiFetch(`${orgBase(organizationId)}/agents/${encodeURIComponent(memberId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * @param {string} organizationId
 * @param {string} conversationId
 */
export function fetchConversationAssignmentAudit(organizationId, conversationId) {
  return apiFetch(
    `${orgBase(organizationId)}/conversations/${encodeURIComponent(conversationId)}/audit`,
  );
}
