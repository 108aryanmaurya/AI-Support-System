const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Max resolved rows scanned per org per cron bucket. */
export const LIFECYCLE_AUTO_CLOSE_BATCH_LIMIT = 200;

/**
 * ISO cutoff: conversations with `last_message_at` before this are idle long enough to auto-close.
 *
 * @param {number} resolvedAutoCloseDays
 * @param {Date} [now]
 * @returns {string}
 */
export function resolvedIdleCutoffIso(resolvedAutoCloseDays, now = new Date()) {
  const days = Number(resolvedAutoCloseDays);
  const safeDays = Number.isFinite(days) && days >= 1 ? days : 14;
  return new Date(now.getTime() - safeDays * MS_PER_DAY).toISOString();
}

/**
 * @param {object} row — conversation with `status`, `last_message_at`
 * @param {string} cutoffIso
 * @returns {boolean}
 */
export function isResolvedIdleCandidate(row, cutoffIso) {
  if (!row || row.status !== 'resolved') return false;
  const lastAt = row.last_message_at;
  if (!lastAt) return false;
  return String(lastAt) < cutoffIso;
}
