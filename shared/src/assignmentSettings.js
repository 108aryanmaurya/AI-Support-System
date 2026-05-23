/**
 * Org intelligent assignment toggles in `organizations.settings.assignment`.
 * Sprint 0: defaults only; Sprint 5+ reads `auto_route_enabled` before `assignment.auto_route` jobs.
 */

/** @typedef {'weighted_hybrid' | 'least_loaded' | 'round_robin' | 'skill_based'} AssignmentStrategy */

export const ASSIGNMENT_STRATEGIES = Object.freeze([
  'weighted_hybrid',
  'least_loaded',
  'round_robin',
  'skill_based',
]);

export const ORG_ASSIGNMENT_SETTINGS_DEFAULTS = Object.freeze({
  /** Master switch for server-side auto-route after classify + workflow (Sprint 5+). */
  auto_route_enabled: false,
  /** Default scoring strategy when auto-route runs (Sprint 4+). */
  strategy: 'weighted_hybrid',
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

  return {
    auto_route_enabled:
      src.auto_route_enabled ?? ORG_ASSIGNMENT_SETTINGS_DEFAULTS.auto_route_enabled,
    strategy,
  };
}

/**
 * @param {unknown} settings
 * @returns {boolean}
 */
export function isOrgAutoRouteEnabled(settings) {
  return Boolean(mergeOrgAssignmentSettings(settings).auto_route_enabled);
}
