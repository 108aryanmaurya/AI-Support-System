/**
 * Sprint 6+ org assignment settings (merged into `organizations.settings.assignment`).
 */

export const ASSIGNMENT_ADVANCED_DEFAULTS = Object.freeze({
  sla_routing_enabled: false,
  /** When remaining first-response SLA is below this many minutes, apply SLA boost. */
  sla_remaining_minutes_threshold: 5,
  reassign_enabled: false,
  /** Enqueue reassignment when `ai.workflow_sla` fires. */
  reassign_on_sla_warning: false,
  /** Reassign open threads when assignee goes offline (heartbeat offline). */
  reassign_on_agent_offline: false,
  vip_routing_enabled: false,
  vip_tag_names: Object.freeze(['vip', 'enterprise']),
  /** Minimum skill proficiency (1–100) for VIP conversations. */
  vip_min_proficiency: 70,
  /** Optional inbox id override for VIP threads. */
  vip_target_inbox_id: null,
});

/**
 * @param {unknown} raw
 */
export function mergeAssignmentAdvancedSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};

  const threshold = Number(src.sla_remaining_minutes_threshold);
  const vipMin = Number(src.vip_min_proficiency);

  const vipTags = [];
  if (Array.isArray(src.vip_tag_names)) {
    for (const t of src.vip_tag_names) {
      if (typeof t !== 'string' || !t.trim()) continue;
      vipTags.push(t.trim().toLowerCase().slice(0, 64));
      if (vipTags.length >= 16) break;
    }
  }

  return {
    sla_routing_enabled: src.sla_routing_enabled ?? ASSIGNMENT_ADVANCED_DEFAULTS.sla_routing_enabled,
    sla_remaining_minutes_threshold:
      Number.isFinite(threshold) && threshold > 0
        ? Math.min(120, Math.round(threshold))
        : ASSIGNMENT_ADVANCED_DEFAULTS.sla_remaining_minutes_threshold,
    reassign_enabled: src.reassign_enabled ?? ASSIGNMENT_ADVANCED_DEFAULTS.reassign_enabled,
    reassign_on_sla_warning:
      src.reassign_on_sla_warning ?? ASSIGNMENT_ADVANCED_DEFAULTS.reassign_on_sla_warning,
    reassign_on_agent_offline:
      src.reassign_on_agent_offline ?? ASSIGNMENT_ADVANCED_DEFAULTS.reassign_on_agent_offline,
    vip_routing_enabled: src.vip_routing_enabled ?? ASSIGNMENT_ADVANCED_DEFAULTS.vip_routing_enabled,
    vip_tag_names:
      vipTags.length > 0 ? vipTags : [...ASSIGNMENT_ADVANCED_DEFAULTS.vip_tag_names],
    vip_min_proficiency:
      Number.isFinite(vipMin) && vipMin >= 1 && vipMin <= 100
        ? Math.round(vipMin)
        : ASSIGNMENT_ADVANCED_DEFAULTS.vip_min_proficiency,
    vip_target_inbox_id:
      typeof src.vip_target_inbox_id === 'string' && src.vip_target_inbox_id.trim()
        ? src.vip_target_inbox_id.trim().slice(0, 64)
        : null,
  };
}

/**
 * @param {string[]} tagNames — lowercase
 * @param {string[]} vipTagNames
 */
export function conversationMatchesVipTags(tagNames, vipTagNames) {
  const tags = tagNames ?? [];
  const vip = vipTagNames ?? [];
  return vip.some((v) => tags.includes(v));
}
