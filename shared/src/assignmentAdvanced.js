/**
 * Org assignment routing behavior (merged into `organizations.settings.assignment`).
 * SLA-urgent ranking, VIP routing, and SLA-triggered reassignment were removed.
 */

export const ASSIGNMENT_ADVANCED_DEFAULTS = Object.freeze({
  /** Reassignment jobs (e.g. assignee offline) are always enabled. */
  reassign_enabled: true,
  reassign_on_agent_offline: true,
});

/**
 * @param {unknown} _raw — legacy keys in stored JSON are ignored
 */
export function mergeAssignmentAdvancedSettings(_raw) {
  return {
    reassign_enabled: ASSIGNMENT_ADVANCED_DEFAULTS.reassign_enabled,
    reassign_on_agent_offline: ASSIGNMENT_ADVANCED_DEFAULTS.reassign_on_agent_offline,
  };
}
