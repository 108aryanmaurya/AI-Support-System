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
 * One next-response SLA workflow run per conversation per calendar day.
 *
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {string} dayKey — e.g. `YYYY-MM-DD`
 */
export function workflowSlaNextResponseIdempotencyKey(organizationId, conversationId, dayKey) {
  return `workflow:sla:next:${organizationId}:${conversationId}:${dayKey}`;
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

/**
 * UTC 15-minute bucket for cron dedupe (00, 15, 30, 45).
 *
 * @param {Date} [date]
 * @returns {string} e.g. `2026-05-23T14:30`
 */
export function fifteenMinuteBucketKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(Math.floor(d.getUTCMinutes() / 15) * 15).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${m}`;
}

/**
 * One org SLA scan per 15-minute bucket (cron should run at least every 15 minutes).
 *
 * @param {string} organizationId
 * @param {string} bucketKey — from {@link fifteenMinuteBucketKey}
 */
export function slaScanOrgIdempotencyKey(organizationId, bucketKey) {
  return `sla.scan:${organizationId}:${bucketKey}`;
}

/**
 * One org lifecycle scan per 15-minute bucket (cron should run at least every 15 minutes).
 *
 * @param {string} organizationId
 * @param {string} bucketKey — from {@link fifteenMinuteBucketKey}
 */
export function lifecycleScanOrgIdempotencyKey(organizationId, bucketKey) {
  return `lifecycle.scan:${organizationId}:${bucketKey}`;
}

/**
 * One auto-close job per resolved conversation (re-enqueue only if prior job dead).
 *
 * @param {string} organizationId
 * @param {string} conversationId
 */
export function lifecycleAutoCloseResolvedIdempotencyKey(organizationId, conversationId) {
  return `lifecycle:auto_close:${organizationId}:${conversationId}`;
}

/**
 * One customer reminder per conversation per waiting cycle.
 *
 * @param {string} organizationId
 * @param {string} conversationId
 */
export function lifecycleCustomerReminderIdempotencyKey(organizationId, conversationId) {
  return `lifecycle:reminder:${organizationId}:${conversationId}`;
}

/**
 * One auto-close-after-reminder job per conversation.
 *
 * @param {string} organizationId
 * @param {string} conversationId
 */
export function lifecycleAutoCloseWaitingIdempotencyKey(organizationId, conversationId) {
  return `lifecycle:auto_close_waiting:${organizationId}:${conversationId}`;
}

/**
 * One auto-route attempt per inbound message (Sprint 5+ `assignment.auto_route`).
 *
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {string} messageId
 */
export function autoRouteIdempotencyKey(organizationId, conversationId, messageId) {
  return `assignment:auto_route:${organizationId}:${conversationId}:${messageId}`;
}

/**
 * One reassignment attempt per conversation per trigger key (Sprint 6+).
 *
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {string} triggerKey — e.g. `offline:memberId`, `sla_warning:day`
 */
export function reassignIdempotencyKey(organizationId, conversationId, triggerKey) {
  return `assignment:reassign:${organizationId}:${conversationId}:${triggerKey}`;
}
