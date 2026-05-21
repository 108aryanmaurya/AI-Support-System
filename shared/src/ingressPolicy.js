/** Org ingress policy in `organizations.settings.ingress` (Phase 4 Sprint 3). */

export const INGRESS_SPAM_ACTIONS = Object.freeze(['flag', 'reject']);
export const INGRESS_DUPLICATE_ACTIONS = Object.freeze(['suppress', 'link']);

export const ORG_INGRESS_POLICY_DEFAULTS = Object.freeze({
  /** Run spam heuristics on customer ingress. */
  spam_enabled: true,
  /** `flag` = accept + mark metadata; `reject` = HTTP 422 before insert. */
  spam_action: 'flag',
  /** Detect near-duplicate customer messages in a time window. */
  duplicate_enabled: true,
  /** `suppress` = return existing row ids; `link` = same as suppress for web/email v1. */
  duplicate_action: 'suppress',
  /** Minutes to look back for duplicate content hash. */
  duplicate_window_minutes: 30,
  /** Optional lowercase phrases (org-specific blocklist). */
  blocklist: [],
});

/**
 * @param {unknown} raw
 * @returns {typeof ORG_INGRESS_POLICY_DEFAULTS & { blocklist: string[] }}
 */
export function mergeOrgIngressPolicy(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const spamAction =
    typeof src.spam_action === 'string' && INGRESS_SPAM_ACTIONS.includes(src.spam_action)
      ? src.spam_action
      : ORG_INGRESS_POLICY_DEFAULTS.spam_action;
  const duplicateAction =
    typeof src.duplicate_action === 'string' &&
    INGRESS_DUPLICATE_ACTIONS.includes(src.duplicate_action)
      ? src.duplicate_action
      : ORG_INGRESS_POLICY_DEFAULTS.duplicate_action;
  const windowMin = Number(src.duplicate_window_minutes);
  const blocklist = Array.isArray(src.blocklist)
    ? src.blocklist
        .filter((t) => typeof t === 'string' && t.trim())
        .map((t) => t.trim().toLowerCase().slice(0, 64))
        .slice(0, 50)
    : [];

  return {
    spam_enabled: src.spam_enabled ?? ORG_INGRESS_POLICY_DEFAULTS.spam_enabled,
    spam_action: spamAction,
    duplicate_enabled: src.duplicate_enabled ?? ORG_INGRESS_POLICY_DEFAULTS.duplicate_enabled,
    duplicate_action: duplicateAction,
    duplicate_window_minutes:
      Number.isFinite(windowMin) && windowMin >= 1 && windowMin <= 1440
        ? Math.round(windowMin)
        : ORG_INGRESS_POLICY_DEFAULTS.duplicate_window_minutes,
    blocklist,
  };
}
