/**
 * Pure helpers for customer reminder email copy (no I/O).
 */

/**
 * @param {string|null|undefined} subject
 * @returns {string}
 */
export function buildReminderSubject(subject) {
  const raw = typeof subject === 'string' ? subject.trim() : '';
  if (!raw) return 'Following up on your request';
  if (/^re:/i.test(raw)) return raw;
  return `Re: ${raw}`;
}

/**
 * @param {object} customer
 * @param {number} waitingDays — days of silence before this reminder (T1)
 * @param {number} autoCloseDays — days after this reminder before auto-close (T2)
 * @returns {string}
 */
export function buildReminderBody(customer, waitingDays, autoCloseDays) {
  const name =
    typeof customer?.name === 'string' && customer.name.trim()
      ? customer.name.trim().split(/\s+/)[0]
      : null;
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const silenceDays = Number(waitingDays);
  const safeSilence =
    Number.isFinite(silenceDays) && silenceDays >= 1 ? Math.round(silenceDays) : 3;
  const silenceLabel = safeSilence === 1 ? '1 day' : `${safeSilence} days`;

  const closeDays = Number(autoCloseDays);
  const safeClose = Number.isFinite(closeDays) && closeDays >= 1 ? Math.round(closeDays) : 7;
  const closeLabel = safeClose === 1 ? '1 day' : `${safeClose} days`;

  return `${greeting}

We wanted to follow up on your recent support request. We have not heard back from you in about ${silenceLabel}.

If you still need help, simply reply to this email and we will continue the conversation.

If we do not receive a reply within about ${closeLabel}, this conversation will be closed automatically.

Thank you.`;
}
