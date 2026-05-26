/**
 * Org conversation lifecycle toggles in `organizations.settings.lifecycle`.
 * Sprint 0: defaults + merge only; cron/UI wire in later sprints.
 */

/** `conversations.closed_reason` values (DB check + app). */
export const CONVERSATION_CLOSED_REASONS = Object.freeze([
  'manual',
  'auto_idle_resolved',
  'auto_no_reply_after_reminder',
]);

/** Statuses treated as terminal for inbound reopen (Sprint 1+). */
export const CONVERSATION_TERMINAL_STATUSES = Object.freeze(['resolved', 'closed']);

export const LIFECYCLE_LIMITS = Object.freeze({
  minDays: 1,
  maxResolvedAutoCloseDays: 365,
  maxWaitingDays: 90,
  maxNewConversationAfterClosedDays: 365,
});

export const ORG_LIFECYCLE_SETTINGS_DEFAULTS = Object.freeze({
  /** Master switch; false until admin enables (Sprint 5 UI). */
  enabled: false,
  /** Resolved → closed after N days without activity. */
  resolved_auto_close_days: 14,
  /** Waiting on customer: send reminder email after T1 days. */
  waiting_reminder_days: 3,
  /** After reminder, close if still no customer reply within T2 days. */
  waiting_auto_close_after_reminder_days: 7,
  /** Customer message on same thread reopens resolved/closed (Model C). */
  reopen_on_customer_message: true,
  /** Closed conversations older than M days always spawn a new conversation. */
  new_conversation_after_closed_days: 90,
  /** Agent outbound sets `waiting_status` to waiting_customer when not terminal. */
  set_waiting_customer_on_agent_reply: true,
  /** Customer inbound sets `waiting_status` to waiting_agent when not terminal. */
  set_waiting_agent_on_customer_reply: true,
  /** Send customer reminder emails when domain is verified. */
  customer_reminder_enabled: true,
});

/**
 * @param {unknown} v
 * @returns {v is typeof CONVERSATION_CLOSED_REASONS[number]}
 */
export function isConversationClosedReason(v) {
  return typeof v === 'string' && CONVERSATION_CLOSED_REASONS.includes(v);
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
export function isConversationTerminalStatus(v) {
  return typeof v === 'string' && CONVERSATION_TERMINAL_STATUSES.includes(v);
}

/**
 * @param {unknown} raw — `organizations.settings.lifecycle`
 * @returns {typeof ORG_LIFECYCLE_SETTINGS_DEFAULTS}
 */
export function mergeOrgLifecycleSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};

  return {
    enabled: src.enabled ?? ORG_LIFECYCLE_SETTINGS_DEFAULTS.enabled,
    resolved_auto_close_days: clampLifecycleDays(
      src.resolved_auto_close_days,
      ORG_LIFECYCLE_SETTINGS_DEFAULTS.resolved_auto_close_days,
      LIFECYCLE_LIMITS.maxResolvedAutoCloseDays,
    ),
    waiting_reminder_days: clampLifecycleDays(
      src.waiting_reminder_days,
      ORG_LIFECYCLE_SETTINGS_DEFAULTS.waiting_reminder_days,
      LIFECYCLE_LIMITS.maxWaitingDays,
    ),
    waiting_auto_close_after_reminder_days: clampLifecycleDays(
      src.waiting_auto_close_after_reminder_days,
      ORG_LIFECYCLE_SETTINGS_DEFAULTS.waiting_auto_close_after_reminder_days,
      LIFECYCLE_LIMITS.maxWaitingDays,
    ),
    reopen_on_customer_message:
      src.reopen_on_customer_message ??
      ORG_LIFECYCLE_SETTINGS_DEFAULTS.reopen_on_customer_message,
    new_conversation_after_closed_days: clampLifecycleDays(
      src.new_conversation_after_closed_days,
      ORG_LIFECYCLE_SETTINGS_DEFAULTS.new_conversation_after_closed_days,
      LIFECYCLE_LIMITS.maxNewConversationAfterClosedDays,
    ),
    set_waiting_customer_on_agent_reply:
      src.set_waiting_customer_on_agent_reply ??
      ORG_LIFECYCLE_SETTINGS_DEFAULTS.set_waiting_customer_on_agent_reply,
    set_waiting_agent_on_customer_reply:
      src.set_waiting_agent_on_customer_reply ??
      ORG_LIFECYCLE_SETTINGS_DEFAULTS.set_waiting_agent_on_customer_reply,
    customer_reminder_enabled:
      src.customer_reminder_enabled ??
      ORG_LIFECYCLE_SETTINGS_DEFAULTS.customer_reminder_enabled,
  };
}

/**
 * Read lifecycle settings from full `organizations.settings` JSON.
 * @param {unknown} orgSettings
 * @returns {typeof ORG_LIFECYCLE_SETTINGS_DEFAULTS}
 */
export function mergeOrgLifecycleSettingsFromOrg(orgSettings) {
  const root = orgSettings && typeof orgSettings === 'object' ? orgSettings : {};
  const lifecycle =
    root.lifecycle && typeof root.lifecycle === 'object' ? root.lifecycle : {};
  return mergeOrgLifecycleSettings(lifecycle);
}

/**
 * @param {unknown} settings — `organizations.settings` or `.lifecycle` slice
 * @returns {boolean}
 */
export function isOrgLifecycleEnabled(settings) {
  if (settings && typeof settings === 'object' && 'lifecycle' in settings) {
    return Boolean(mergeOrgLifecycleSettingsFromOrg(settings).enabled);
  }
  return Boolean(mergeOrgLifecycleSettings(settings).enabled);
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} maxDays
 * @returns {number}
 */
function clampLifecycleDays(value, fallback, maxDays) {
  const n = Number(value);
  if (
    !Number.isFinite(n) ||
    n < LIFECYCLE_LIMITS.minDays ||
    n > maxDays
  ) {
    return fallback;
  }
  return Math.round(n);
}
