import { mergeWorkflowSchedule } from '@ai-support/shared';

/**
 * Parse HH:MM to minutes since midnight.
 *
 * @param {string} hhmm
 */
function parseMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map((x) => Number(x));
  return h * 60 + m;
}

/**
 * Local weekday 0–6 (Sun–Sat) for a Date in a timezone.
 *
 * @param {Date} at
 * @param {string} timeZone
 */
function localWeekday(at, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const name = fmt.format(at);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[name] ?? at.getUTCDay();
}

/**
 * Local HH:MM for a Date in a timezone.
 *
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
 * @param {import('@ai-support/shared').mergeWorkflowSchedule extends (r: infer R) => unknown ? ReturnType<typeof mergeWorkflowSchedule> : never} schedule
 * @param {Date} [at]
 */
export function isWithinBusinessHours(schedule, at = new Date()) {
  const cfg = mergeWorkflowSchedule(schedule);
  let tz = cfg.timezone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }

  const weekday = localWeekday(at, tz);
  if (!cfg.days.includes(weekday)) return false;

  const nowMin = parseMinutes(localHHMM(at, tz));
  const startMin = parseMinutes(cfg.start);
  const endMin = parseMinutes(cfg.end);

  if (startMin === endMin) return true;
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  return nowMin >= startMin || nowMin < endMin;
}
