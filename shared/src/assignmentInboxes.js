/**
 * Org routing inboxes in `organizations.settings.assignment` (Sprint 3+).
 */

import { mergeAssignmentAdvancedSettings } from './assignmentAdvanced.js';
import { mergeAssignmentRoutingPreferences } from './assignmentRoutingPreferences.js';
import { mergeOrgAssignmentSettings } from './assignmentSettings.js';

export const ASSIGNMENT_INBOX_LIMITS = Object.freeze({
  maxInboxes: 24,
  maxMembersPerInbox: 200,
  maxRulesPerInbox: 8,
});

export const ORG_ASSIGNMENT_ROUTING_DEFAULTS = Object.freeze({
  defaultInboxId: 'default',
  inboxes: Object.freeze([
    Object.freeze({
      id: 'default',
      name: 'General Support',
      memberIds: [],
      channels: [],
      intents: [],
      languages: [],
      tags: [],
    }),
  ]),
  channelInboxMap: Object.freeze({}),
});

/**
 * @param {unknown} raw
 */
export function mergeOrgAssignmentRouting(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const toggles = mergeOrgAssignmentSettings(src);

  const defaultInboxId =
    typeof src.defaultInboxId === 'string' && src.defaultInboxId.trim()
      ? src.defaultInboxId.trim().slice(0, 64)
      : ORG_ASSIGNMENT_ROUTING_DEFAULTS.defaultInboxId;

  /** @type {object[]} */
  const inboxes = [];
  if (Array.isArray(src.inboxes)) {
    for (const row of src.inboxes.slice(0, ASSIGNMENT_INBOX_LIMITS.maxInboxes)) {
      if (!row || typeof row !== 'object') continue;
      const id = typeof row.id === 'string' ? row.id.trim().slice(0, 64) : '';
      if (!id) continue;
      const name =
        typeof row.name === 'string' && row.name.trim()
          ? row.name.trim().slice(0, 120)
          : id;
      inboxes.push({
        id,
        name,
        memberIds: normalizeIdList(row.memberIds, ASSIGNMENT_INBOX_LIMITS.maxMembersPerInbox),
        channels: normalizeStringList(row.channels, 16, true),
        intents: normalizeStringList(row.intents, 32, true),
        languages: normalizeStringList(row.languages, 16, true),
        tags: normalizeStringList(row.tags, 32, true),
      });
    }
  }

  if (!inboxes.some((i) => i.id === defaultInboxId)) {
    inboxes.unshift({
      id: defaultInboxId,
      name: 'General Support',
      memberIds: [],
      channels: [],
      intents: [],
      languages: [],
      tags: [],
    });
  }

  const channelInboxMap = {};
  if (src.channelInboxMap && typeof src.channelInboxMap === 'object') {
    for (const [ch, inboxId] of Object.entries(src.channelInboxMap)) {
      if (typeof ch !== 'string' || typeof inboxId !== 'string') continue;
      const key = ch.trim().slice(0, 32);
      const val = inboxId.trim().slice(0, 64);
      if (key && val) channelInboxMap[key] = val;
    }
  }

  return {
    ...toggles,
    ...mergeAssignmentAdvancedSettings(src),
    ...mergeAssignmentRoutingPreferences(src),
    defaultInboxId,
    inboxes,
    channelInboxMap,
  };
}

/**
 * @param {unknown} list
 * @param {number} max
 * @param {boolean} [lower]
 */
function normalizeStringList(list, max, lower = false) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const s = lower ? item.trim().toLowerCase() : item.trim();
    if (!s) continue;
    out.push(s.slice(0, 64));
    if (out.length >= max) break;
  }
  return out;
}

/**
 * @param {unknown} list
 * @param {number} max
 */
function normalizeIdList(list, max) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string' || !item.trim()) continue;
    out.push(item.trim());
    if (out.length >= max) break;
  }
  return out;
}

/**
 * @param {unknown} metadata
 */
export function parseConversationMetadataAssignment(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (metadata).assignment;
  if (!raw || typeof raw !== 'object') return null;
  const src = /** @type {Record<string, unknown>} */ (raw);
  const targetInboxId =
    typeof src.target_inbox_id === 'string'
      ? src.target_inbox_id.trim()
      : typeof src.targetInboxId === 'string'
        ? src.targetInboxId.trim()
        : null;
  if (!targetInboxId) return null;
  return {
    targetInboxId,
    source: typeof src.source === 'string' ? src.source : null,
    ruleId: typeof src.rule_id === 'string' ? src.rule_id : null,
    updatedAt: typeof src.updated_at === 'string' ? src.updated_at : null,
  };
}
