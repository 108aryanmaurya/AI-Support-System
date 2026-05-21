/**
 * Idempotency keys for Phase 4 `automation_jobs` rows.
 * Unique index: (organization_id, idempotency_key) where key is not null.
 */

/**
 * One workflow evaluation per inbound customer message.
 *
 * @param {string} organizationId
 * @param {string} messageId
 */
export function workflowInboundIdempotencyKey(organizationId, messageId) {
  return `workflow:inbound:${organizationId}:${messageId}`;
}

/**
 * One workflow evaluation per tag attach event.
 *
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {string} tagId
 */
export function workflowTagAddedIdempotencyKey(organizationId, conversationId, tagId) {
  return `workflow:tag:${organizationId}:${conversationId}:${tagId}`;
}

/**
 * One SLA-warning workflow run per conversation per calendar day.
 *
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {string} dayKey — e.g. `YYYY-MM-DD`
 */
export function workflowSlaWarningIdempotencyKey(organizationId, conversationId, dayKey) {
  return `workflow:sla:${organizationId}:${conversationId}:${dayKey}`;
}

/**
 * One schedule workflow scan per org per hour bucket.
 *
 * @param {string} organizationId
 * @param {string} hourKey — e.g. `YYYY-MM-DDTHH`
 */
export function workflowScheduleScanIdempotencyKey(organizationId, hourKey) {
  return `workflow:schedule:${organizationId}:${hourKey}`;
}
