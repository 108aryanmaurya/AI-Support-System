/**
 * Org assignment-related settings in `organizations.settings.assignment`.
 * Scoring is per team inbox (`inboxes.settings.assignmentMethod`), not org-wide.
 */

import { ASSIGNMENT_LIMITS } from './assignment.js';

/** Org-wide defaults applied to new agent profiles and routing notifications. */
export const ORG_ASSIGNMENT_ORG_DEFAULTS = Object.freeze({
  default_max_concurrency: ASSIGNMENT_LIMITS.defaultConcurrency,
  default_shift_start: null,
  default_shift_end: null,
  default_timezone: 'UTC',
  /** Member ids to notify when auto-route finds no eligible agent. */
  fallback_notify_member_ids: Object.freeze([]),
});

/**
 * @deprecated Use {@link ORG_ASSIGNMENT_ORG_DEFAULTS}. Kept for importers only.
 */
export const ORG_ASSIGNMENT_SETTINGS_DEFAULTS = ORG_ASSIGNMENT_ORG_DEFAULTS;

/**
 * @param {unknown} raw — `organizations.settings.assignment`
 * @returns {typeof ORG_ASSIGNMENT_ORG_DEFAULTS}
 */
export function mergeOrgAssignmentSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};

  const maxConc = Number(src.default_max_concurrency);
  const fallbackIds = [];
  if (Array.isArray(src.fallback_notify_member_ids)) {
    for (const id of src.fallback_notify_member_ids) {
      if (typeof id !== 'string' || !id.trim()) continue;
      fallbackIds.push(id.trim());
      if (fallbackIds.length >= 24) break;
    }
  }

  const shiftStart =
    typeof src.default_shift_start === 'string' && src.default_shift_start.trim()
      ? src.default_shift_start.trim().slice(0, 5)
      : null;
  const shiftEnd =
    typeof src.default_shift_end === 'string' && src.default_shift_end.trim()
      ? src.default_shift_end.trim().slice(0, 5)
      : null;
  const timezone =
    typeof src.default_timezone === 'string' && src.default_timezone.trim()
      ? src.default_timezone.trim().slice(0, ASSIGNMENT_LIMITS.maxTimezoneLength)
      : ORG_ASSIGNMENT_ORG_DEFAULTS.default_timezone;

  return {
    default_max_concurrency:
      Number.isFinite(maxConc) &&
      maxConc >= ASSIGNMENT_LIMITS.minConcurrency &&
      maxConc <= ASSIGNMENT_LIMITS.maxConcurrency
        ? Math.round(maxConc)
        : ORG_ASSIGNMENT_ORG_DEFAULTS.default_max_concurrency,
    default_shift_start: shiftStart,
    default_shift_end: shiftEnd,
    default_timezone: timezone,
    fallback_notify_member_ids: fallbackIds,
  };
}

/**
 * @deprecated Auto-route is per inbox (`inboxes.settings.assignmentMethod`). Always false at org level.
 * @returns {boolean}
 */
export function isOrgAutoRouteEnabled() {
  return false;
}
