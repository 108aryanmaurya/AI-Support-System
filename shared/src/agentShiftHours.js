/**
 * Agent shift window evaluation (Sprint 2+) — local time in agent timezone.
 */

const SHIFT_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * @param {string} hhmm
 */
function parseMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map((x) => Number(x));
  return h * 60 + m;
}

/**
 * @param {Date} at
 * @param {string} timeZone
 */
function localHHMM(at, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt.format(at);
}

/**
 * No shift configured → treat as always within shift (24/7 routing eligible).
 *
 * @param {object} profile
 * @param {string | null} [profile.shiftStart] — HH:MM
 * @param {string | null} [profile.shiftEnd]
 * @param {string} [profile.timezone]
 * @param {Date} [at]
 */
export function isWithinAgentShift(profile, at = new Date()) {
  const start = profile?.shiftStart ?? profile?.shift_start ?? null;
  const end = profile?.shiftEnd ?? profile?.shift_end ?? null;
  if (!start && !end) return true;
  if (!start || !end) return true;

  const startStr = String(start).trim();
  const endStr = String(end).trim();
  if (!SHIFT_TIME_RE.test(startStr) || !SHIFT_TIME_RE.test(endStr)) return true;

  let tz = profile?.timezone ?? 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }

  const nowMin = parseMinutes(localHHMM(at, tz));
  const startMin = parseMinutes(startStr);
  const endMin = parseMinutes(endStr);

  if (startMin === endMin) return true;
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  return nowMin >= startMin || nowMin < endMin;
}
