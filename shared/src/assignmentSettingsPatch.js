/**
 * Whitelist patch keys for `PUT .../assignment/settings` (Sprint 7+).
 */

import { isAssignmentStrategy } from './assignment.js';

const BOOL_KEYS = [
  'auto_route_enabled',
  'sla_routing_enabled',
  'reassign_enabled',
  'reassign_on_sla_warning',
  'reassign_on_agent_offline',
  'vip_routing_enabled',
];

const NUM_KEYS = ['sla_remaining_minutes_threshold', 'vip_min_proficiency', 'default_max_concurrency'];

const STRING_KEYS = [
  'strategy',
  'vip_target_inbox_id',
  'default_shift_start',
  'default_shift_end',
  'default_timezone',
  'defaultInboxId',
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

  if (Object.prototype.hasOwnProperty.call(src, 'strategy')) {
    const s = typeof src.strategy === 'string' ? src.strategy.trim() : '';
    if (s && isAssignmentStrategy(s)) out.strategy = s;
    else delete out.strategy;
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

  return out;
}
