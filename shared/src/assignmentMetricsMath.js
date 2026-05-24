/**
 * Pure helpers for assignment ops metrics (Sprint 8+).
 */

/**
 * @param {number[]} values
 * @param {number} p — 0–100
 * @returns {number | null}
 */
export function percentile(values, p) {
  if (!values?.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

/**
 * Population standard deviation of active-chat counts across agents.
 *
 * @param {number[]} counts
 * @returns {number | null}
 */
export function stddevActiveChats(counts) {
  if (!counts?.length) return null;
  const n = counts.length;
  if (n === 1) return 0;
  const mean = counts.reduce((a, b) => a + b, 0) / n;
  const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / n;
  return Math.round(Math.sqrt(variance) * 100) / 100;
}
