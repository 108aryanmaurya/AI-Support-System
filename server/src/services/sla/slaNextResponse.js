const MS_PER_MINUTE = 60 * 1000;

/**
 * ISO cutoff: `last_customer_message_at` before this → next-response SLA may be breached.
 *
 * @param {number} slaMinutes
 * @param {Date} [now]
 * @returns {string}
 */
export function nextResponseSlaCutoffIso(slaMinutes, now = new Date()) {
  const minutes = Number(slaMinutes);
  const safe = Number.isFinite(minutes) && minutes >= 1 ? minutes : 60;
  return new Date(now.getTime() - safe * MS_PER_MINUTE).toISOString();
}

/**
 * Agent has not replied since the customer's last message (uses denormalized timestamps).
 *
 * @param {object} row
 * @returns {boolean}
 */
export function agentHasNotRepliedSinceLastCustomerMessage(row) {
  if (!row?.last_customer_message_at) return false;
  const customerAt = String(row.last_customer_message_at);
  const agentAt = row.last_agent_message_at;
  if (!agentAt) return true;
  return String(agentAt) <= customerAt;
}

/**
 * @param {object} row — conversation with waiting_status, last_* timestamps
 * @param {number} slaMinutes
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isNextResponseSlaBreached(row, slaMinutes, now = new Date()) {
  if (!row || row.waiting_status !== 'waiting_agent') return false;
  if (row.status !== 'open' && row.status !== 'pending') return false;
  if (!agentHasNotRepliedSinceLastCustomerMessage(row)) return false;

  const anchor = row.last_customer_message_at;
  if (!anchor) return false;

  const minutes = Number(slaMinutes);
  const safeMinutes = Number.isFinite(minutes) && minutes >= 1 ? minutes : 60;
  const deadlineMs = new Date(anchor).getTime() + safeMinutes * MS_PER_MINUTE;
  return Number.isFinite(deadlineMs) && now.getTime() >= deadlineMs;
}
