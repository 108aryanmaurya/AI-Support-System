import { LIFECYCLE_LIMITS } from './lifecycleSettings.js';

const BOOL_KEYS = [
  'enabled',
  'reopen_on_customer_message',
  'set_waiting_customer_on_agent_reply',
  'set_waiting_agent_on_customer_reply',
  'customer_reminder_enabled',
];

const DAY_KEYS = [
  'resolved_auto_close_days',
  'waiting_reminder_days',
  'waiting_auto_close_after_reminder_days',
  'new_conversation_after_closed_days',
];

const DAY_MAX = {
  resolved_auto_close_days: LIFECYCLE_LIMITS.maxResolvedAutoCloseDays,
  waiting_reminder_days: LIFECYCLE_LIMITS.maxWaitingDays,
  waiting_auto_close_after_reminder_days: LIFECYCLE_LIMITS.maxWaitingDays,
  new_conversation_after_closed_days: LIFECYCLE_LIMITS.maxNewConversationAfterClosedDays,
};

/**
 * Build partial `settings.lifecycle` from API body (whitelist).
 *
 * @param {unknown} body
 */
export function buildLifecycleSettingsPatch(body) {
  if (!body || typeof body !== 'object') return {};

  const src = /** @type {Record<string, unknown>} */ (body);
  /** @type {Record<string, unknown>} */
  const out = {};

  for (const key of BOOL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = Boolean(src[key]);
    }
  }

  for (const key of DAY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      const n = Number(src[key]);
      const max = DAY_MAX[key] ?? 365;
      if (Number.isFinite(n) && n >= LIFECYCLE_LIMITS.minDays && n <= max) {
        out[key] = Math.round(n);
      }
    }
  }

  return out;
}
