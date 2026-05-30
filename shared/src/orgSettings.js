/** Org-level AI toggles stored in `organizations.settings.ai`. */
export const ORG_AI_SETTINGS_DEFAULTS = Object.freeze({
  /** Master switch for AI features in this org. */
  ai_enabled: true,
  /** Phase 3: copilot suggest / summarize in inbox. */
  assist_enabled: true,
  /** Phase 3–4: classify and write tags to conversation metadata. */
  auto_tag_enabled: false,
  /** Phase 4: route new conversations to AI queue when unassigned. */
  auto_route_to_ai: false,
  /** Phase 4: master switch for workflow automation jobs (`ai.workflow_*`). */
  workflow_automation_enabled: false,
  /** Phase 6: allow autonomous customer-visible AI replies. */
  autonomous_replies_enabled: false,
  /** Default for `conversations.ai_enabled` on new conversations. */
  default_conversation_ai_enabled: true,
  /** Future: model tier / cost cap (no LLM wired yet). */
  model_tier: 'standard',
});

export const ORG_AI_MODEL_TIERS = Object.freeze(['standard', 'advanced']);

/** Org automation toggles in `organizations.settings.automation`. */
export const ORG_AUTOMATION_SETTINGS_DEFAULTS = Object.freeze({
  inbound_notify_enabled: true,
  assignment_notify_enabled: true,
  /** Email when an agent is @mentioned on an internal note (default on). */
  mention_notify_enabled: true,
  sla_enabled: true,
  /** Email on SLA breach (scan path); independent of workflow rules. */
  sla_notify_enabled: true,
  first_response_sla_minutes: 60,
  /** Agent must reply after customer message while `waiting_status = waiting_agent`. */
  next_response_sla_minutes: 60,
});

/**
 * @param {unknown} raw
 * @returns {typeof ORG_AI_SETTINGS_DEFAULTS}
 */
export function mergeOrgAiSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const tier =
    typeof src.model_tier === 'string' && ORG_AI_MODEL_TIERS.includes(src.model_tier)
      ? src.model_tier
      : ORG_AI_SETTINGS_DEFAULTS.model_tier;

  return {
    ai_enabled: src.ai_enabled ?? ORG_AI_SETTINGS_DEFAULTS.ai_enabled,
    assist_enabled: src.assist_enabled ?? ORG_AI_SETTINGS_DEFAULTS.assist_enabled,
    auto_tag_enabled: src.auto_tag_enabled ?? ORG_AI_SETTINGS_DEFAULTS.auto_tag_enabled,
    auto_route_to_ai: src.auto_route_to_ai ?? ORG_AI_SETTINGS_DEFAULTS.auto_route_to_ai,
    workflow_automation_enabled:
      src.workflow_automation_enabled ?? ORG_AI_SETTINGS_DEFAULTS.workflow_automation_enabled,
    autonomous_replies_enabled:
      src.autonomous_replies_enabled ?? ORG_AI_SETTINGS_DEFAULTS.autonomous_replies_enabled,
    default_conversation_ai_enabled:
      src.default_conversation_ai_enabled ?? ORG_AI_SETTINGS_DEFAULTS.default_conversation_ai_enabled,
    model_tier: tier,
  };
}

/**
 * @param {unknown} raw
 * @returns {typeof ORG_AUTOMATION_SETTINGS_DEFAULTS}
 */
export function mergeOrgAutomationSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const minutes = Number(src.first_response_sla_minutes);
  const nextMinutes = Number(src.next_response_sla_minutes);
  const firstSla =
    Number.isFinite(minutes) && minutes > 0
      ? Math.min(10080, Math.round(minutes))
      : ORG_AUTOMATION_SETTINGS_DEFAULTS.first_response_sla_minutes;
  return {
    inbound_notify_enabled:
      src.inbound_notify_enabled ?? ORG_AUTOMATION_SETTINGS_DEFAULTS.inbound_notify_enabled,
    assignment_notify_enabled:
      src.assignment_notify_enabled ?? ORG_AUTOMATION_SETTINGS_DEFAULTS.assignment_notify_enabled,
    mention_notify_enabled:
      src.mention_notify_enabled ?? ORG_AUTOMATION_SETTINGS_DEFAULTS.mention_notify_enabled,
    sla_enabled: src.sla_enabled ?? ORG_AUTOMATION_SETTINGS_DEFAULTS.sla_enabled,
    sla_notify_enabled:
      src.sla_notify_enabled ?? ORG_AUTOMATION_SETTINGS_DEFAULTS.sla_notify_enabled,
    first_response_sla_minutes: firstSla,
    next_response_sla_minutes:
      Number.isFinite(nextMinutes) && nextMinutes > 0
        ? Math.min(10080, Math.round(nextMinutes))
        : firstSla,
  };
}
