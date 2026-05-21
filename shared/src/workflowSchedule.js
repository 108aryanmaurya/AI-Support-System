/** Org workflow schedule / business hours in `organizations.settings.workflow.schedule`. */

export const WORKFLOW_SCHEDULE_DEFAULTS = Object.freeze({
  /** Run `ai.workflow_schedule_org` cron scans for this org. */
  enabled: false,
  /** IANA timezone (e.g. America/New_York). Falls back to UTC if invalid. */
  timezone: 'UTC',
  /** Local start time HH:MM (24h). */
  start: '09:00',
  /** Local end time HH:MM (24h). */
  end: '17:00',
  /** Weekdays when window applies: 0=Sun … 6=Sat. Default Mon–Fri. */
  days: [1, 2, 3, 4, 5],
});

const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** @param {unknown} v */
export function isValidWorkflowTimeHHMM(v) {
  return typeof v === 'string' && HHMM_RE.test(v.trim());
}

/**
 * @param {unknown} raw
 * @returns {typeof WORKFLOW_SCHEDULE_DEFAULTS}
 */
export function mergeWorkflowSchedule(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const start =
    typeof src.start === 'string' && isValidWorkflowTimeHHMM(src.start)
      ? src.start.trim()
      : WORKFLOW_SCHEDULE_DEFAULTS.start;
  const end =
    typeof src.end === 'string' && isValidWorkflowTimeHHMM(src.end)
      ? src.end.trim()
      : WORKFLOW_SCHEDULE_DEFAULTS.end;
  const days = Array.isArray(src.days)
    ? src.days
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [...WORKFLOW_SCHEDULE_DEFAULTS.days];
  const timezone =
    typeof src.timezone === 'string' && src.timezone.trim()
      ? src.timezone.trim().slice(0, 64)
      : WORKFLOW_SCHEDULE_DEFAULTS.timezone;

  return {
    enabled: src.enabled ?? WORKFLOW_SCHEDULE_DEFAULTS.enabled,
    timezone,
    start,
    end,
    days: days.length ? [...new Set(days)] : [...WORKFLOW_SCHEDULE_DEFAULTS.days],
  };
}
