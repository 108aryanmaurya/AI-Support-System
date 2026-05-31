/**
 * Whitelist patch keys for `PUT .../assignment/settings` (Sprint 7+).
 */

const BOOL_KEYS = [
  'sla_routing_enabled',
  'reassign_enabled',
  'reassign_on_sla_warning',
  'reassign_on_agent_offline',
  'vip_routing_enabled',
];

const NUM_KEYS = ['sla_remaining_minutes_threshold', 'default_max_concurrency'];

const STRING_KEYS = [
  'vip_target_inbox_id',
  'default_shift_start',
  'default_shift_end',
  'default_timezone',
  'defaultInboxId',
  'self_assign_on_reply',
];

/**
 * Build a partial `settings.assignment` object from an API body (only known keys).
 *
 * @param {unknown} body
 */
export function buildAssignmentSettingsPatch(body) {
  if (!body || typeof body !== 'object') return {};

  const src = /** @type {Record<string, unknown>} */ (body);
  /** @type {Record<string, unknown>} */
  const out = {};

  for (const key of BOOL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = Boolean(src[key]);
    }
  }

  for (const key of NUM_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      const n = Number(src[key]);
      if (Number.isFinite(n)) out[key] = n;
    }
  }

  for (const key of STRING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      const v = src[key];
      if (v === null) {
        out[key] = null;
      } else if (typeof v === 'string') {
        out[key] = v.trim();
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(src, 'vip_tag_names') && Array.isArray(src.vip_tag_names)) {
    out.vip_tag_names = src.vip_tag_names
      .filter((t) => typeof t === 'string' && t.trim())
      .map((t) => t.trim().toLowerCase().slice(0, 64))
      .slice(0, 16);
  }

  if (
    Object.prototype.hasOwnProperty.call(src, 'fallback_notify_member_ids') &&
    Array.isArray(src.fallback_notify_member_ids)
  ) {
    out.fallback_notify_member_ids = src.fallback_notify_member_ids
      .filter((id) => typeof id === 'string' && id.trim())
      .map((id) => id.trim())
      .slice(0, 24);
  }

  if (Object.prototype.hasOwnProperty.call(src, 'default_assignee')) {
    const da = src.default_assignee;
    if (da && typeof da === 'object') {
      const type = typeof da.type === 'string' ? da.type.trim() : 'unassigned';
      if (type === 'unassigned') {
        out.default_assignee = { type: 'unassigned' };
      } else if (type === 'inbox') {
        const inboxId =
          typeof da.inboxId === 'string'
            ? da.inboxId.trim()
            : typeof da.inbox_id === 'string'
              ? da.inbox_id.trim()
              : '';
        if (inboxId) out.default_assignee = { type: 'inbox', inboxId };
      } else if (type === 'member') {
        const memberId =
          typeof da.memberId === 'string'
            ? da.memberId.trim()
            : typeof da.member_id === 'string'
              ? da.member_id.trim()
              : '';
        if (memberId) out.default_assignee = { type: 'member', memberId };
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(src, 'self_assign_on_reply')) {
    const mode = typeof src.self_assign_on_reply === 'string' ? src.self_assign_on_reply.trim() : '';
    if (mode === 'assign_to_me' || mode === 'keep_queue') {
      out.self_assign_on_reply = mode;
    }
  }

  return out;
}
