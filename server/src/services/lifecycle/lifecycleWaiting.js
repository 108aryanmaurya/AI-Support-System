import { getConversationWaitingStatus } from '@ai-support/shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {object} row
 * @returns {boolean}
 */
export function isWaitingOnCustomerRow(row) {
  return getConversationWaitingStatus(row) === 'waiting_customer';
}

/** Max waiting_customer rows processed per org per cron bucket. */
export const LIFECYCLE_WAITING_BATCH_LIMIT = 200;

/**
 * @param {number} days
 * @param {Date} [now]
 * @returns {string}
 */
export function daysAgoIso(days, now = new Date()) {
  const n = Number(days);
  const safe = Number.isFinite(n) && n >= 1 ? n : 1;
  return new Date(now.getTime() - safe * MS_PER_DAY).toISOString();
}

/**
 * Anchor for "last customer activity" when scheduling reminders.
 *
 * @param {object} row
 * @returns {string|null}
 */
export function waitingReminderAnchor(row) {
  if (!row || typeof row !== 'object') return null;
  return (
    row.last_customer_message_at ??
    row.last_agent_message_at ??
    row.last_message_at ??
    row.created_at ??
    null
  );
}

/**
 * @param {object} row
 * @param {string} reminderCutoffIso
 * @returns {boolean}
 */
export function isWaitingReminderCandidate(row, reminderCutoffIso) {
  if (!row || !isWaitingOnCustomerRow(row)) return false;
  if (row.customer_reminder_sent_at) return false;
  const anchor = waitingReminderAnchor(row);
  if (!anchor) return false;
  return String(anchor) < reminderCutoffIso;
}

/**
 * Eligible for auto-close after reminder: reminder sent long ago, no customer reply since.
 *
 * @param {object} row
 * @param {string} closeCutoffIso — `customer_reminder_sent_at` must be before this
 * @returns {boolean}
 */
export function isWaitingCloseAfterReminderCandidate(row, closeCutoffIso) {
  if (!row || !isWaitingOnCustomerRow(row)) return false;
  if (!row.customer_reminder_sent_at) return false;
  if (String(row.customer_reminder_sent_at) >= closeCutoffIso) return false;

  const lastCustomer = row.last_customer_message_at;
  if (!lastCustomer) return true;
  return String(lastCustomer) <= String(row.customer_reminder_sent_at);
}

/**
 * Customer replied after agent set waiting — skip reminder send.
 *
 * @param {object} row
 * @returns {boolean}
 */
export function customerRepliedSinceWaiting(row) {
  if (!row?.last_customer_message_at || !row?.last_agent_message_at) return false;
  return String(row.last_customer_message_at) > String(row.last_agent_message_at);
}
