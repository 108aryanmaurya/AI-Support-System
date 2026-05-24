/**
 * Org intelligent assignment toggles in `organizations.settings.assignment`.
 * Sprint 0: defaults only; Sprint 5+ reads `auto_route_enabled` before `assignment.auto_route` jobs.
 */

import { ASSIGNMENT_LIMITS, ASSIGNMENT_STRATEGIES } from './assignment.js';

export { ASSIGNMENT_STRATEGIES };

export const ORG_ASSIGNMENT_SETTINGS_DEFAULTS = Object.freeze({
  /** Master switch for server-side auto-route after classify + workflow (Sprint 5+). */
  auto_route_enabled: false,
  /** Default scoring strategy when auto-route runs (Sprint 4+). */
  strategy: 'weighted_hybrid',
});

/** Org-wide defaults applied to new agent profiles (Sprint 7+ admin UI). */
export const ORG_ASSIGNMENT_ORG_DEFAULTS = Object.freeze({
  default_max_concurrency: ASSIGNMENT_LIMITS.defaultConcurrency,
  default_shift_start: null,
  default_shift_end: null,
  default_timezone: 'UTC',
  /** Member ids to notify when auto-route finds no eligible agent. */
  fallback_notify_member_ids: Object.freeze([]),
});

/**
 * @param {unknown} raw — `organizations.settings.assignment`
 * @returns {typeof ORG_ASSIGNMENT_SETTINGS_DEFAULTS}
 */
export function mergeOrgAssignmentSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const strategy =
    typeof src.strategy === 'string' && ASSIGNMENT_STRATEGIES.includes(src.strategy)
      ? src.strategy
      : ORG_ASSIGNMENT_SETTINGS_DEFAULTS.strategy;

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
    auto_route_enabled:
      src.auto_route_enabled ?? ORG_ASSIGNMENT_SETTINGS_DEFAULTS.auto_route_enabled,
    strategy,
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
 * @param {unknown} settings
 * @returns {boolean}
 */
export function isOrgAutoRouteEnabled(settings) {
  return Boolean(mergeOrgAssignmentSettings(settings).auto_route_enabled);
}
