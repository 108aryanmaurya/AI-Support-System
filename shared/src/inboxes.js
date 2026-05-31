/**
 * Customer-facing inbox entities (DB-backed queues per organization).
 */

export const INBOX_STATUSES = Object.freeze(['active', 'archived']);

export const INBOX_MEMBER_ROLES = Object.freeze(['member', 'lead']);

export const INBOX_LIMITS = Object.freeze({
  maxInboxes: 24,
  maxMembersPerInbox: 200,
  maxNameLength: 120,
  maxSlugLength: 64,
  maxTransferReasonLength: 500,
});

export const DEFAULT_INBOX_NAME = 'General';

/** Per-inbox assignment queue mode (stored in `inboxes.settings.assignmentMethod`). */
export const INBOX_ASSIGNMENT_METHODS = Object.freeze(['manual', 'round_robin', 'balanced']);

export const INBOX_ASSIGNMENT_METHOD_DEFAULT = 'manual';

/** @param {unknown} v */
export function isInboxAssignmentMethod(v) {
  return typeof v === 'string' && INBOX_ASSIGNMENT_METHODS.includes(v);
}

/** @param {unknown} v */
export function isInboxStatus(v) {
  return typeof v === 'string' && INBOX_STATUSES.includes(v);
}

/** @param {unknown} v */
export function isInboxMemberRole(v) {
  return typeof v === 'string' && INBOX_MEMBER_ROLES.includes(v);
}

/**
 * URL-safe slug from inbox name.
 * @param {string} name
 */
export function slugifyInboxName(name) {
  const base = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (base || 'inbox').slice(0, INBOX_LIMITS.maxSlugLength);
}

/**
 * Merge per-inbox settings JSONB.
 * @param {unknown} raw
 */
export function mergeInboxSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const channels = [];
  if (Array.isArray(src.channels)) {
    for (const ch of src.channels.slice(0, 16)) {
      if (typeof ch === 'string' && ch.trim()) channels.push(ch.trim().slice(0, 32));
    }
  }
  const intents = [];
  if (Array.isArray(src.intents)) {
    for (const it of src.intents.slice(0, 32)) {
      if (typeof it === 'string' && it.trim()) intents.push(it.trim().toLowerCase().slice(0, 64));
    }
  }
  const tags = [];
  if (Array.isArray(src.tags)) {
    for (const t of src.tags.slice(0, 32)) {
      if (typeof t === 'string' && t.trim()) tags.push(t.trim().toLowerCase().slice(0, 64));
    }
  }
  const channelInboxMap = {};
  if (src.channelInboxMap && typeof src.channelInboxMap === 'object') {
    for (const [ch, inboxId] of Object.entries(src.channelInboxMap)) {
      if (typeof ch === 'string' && typeof inboxId === 'string' && inboxId.trim()) {
        channelInboxMap[ch.trim().slice(0, 32)] = inboxId.trim();
      }
    }
  }
  const assignmentMethod = isInboxAssignmentMethod(src.assignmentMethod)
    ? src.assignmentMethod
    : INBOX_ASSIGNMENT_METHOD_DEFAULT;

  return { channels, intents, tags, channelInboxMap, assignmentMethod };
}

/** @param {ReturnType<typeof mergeInboxSettings>} settings */
export function isInboxAutoAssignmentEnabled(settings) {
  return settings?.assignmentMethod !== 'manual';
}

/**
 * Map inbox UI method → scoring strategy for `assignment.auto_route`.
 * - `round_robin` — traditional sequential rotation among eligible inbox members
 * - `balanced` — `least_loaded`: teammate with the fewest open (active) conversations
 *
 * @param {unknown} method
 */
export function inboxAssignmentMethodToScoringStrategy(method) {
  if (method === 'round_robin') return 'round_robin';
  if (method === 'balanced') return 'least_loaded';
  return null;
}

/** Strategies driven by per-inbox assignment method (not org weighted hybrid). */
export const INBOX_DEDICATED_ASSIGNMENT_STRATEGIES = Object.freeze(['round_robin', 'least_loaded']);

/**
 * @param {unknown} strategy
 * @returns {boolean}
 */
export function isDedicatedInboxAssignmentStrategy(strategy) {
  return (
    typeof strategy === 'string' && INBOX_DEDICATED_ASSIGNMENT_STRATEGIES.includes(strategy)
  );
}

/**
 * @param {ReturnType<typeof mergeInboxSettings>} settings
 */
export function inboxScoringStrategyFromSettings(settings) {
  if (!isInboxAutoAssignmentEnabled(settings)) return null;
  return inboxAssignmentMethodToScoringStrategy(settings.assignmentMethod);
}

/**
 * Org-level inbox feature settings in `organizations.settings.inboxes`.
 * @param {unknown} raw
 */
export function mergeOrgInboxSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: src.enabled !== false,
    migratedFromAssignment: Boolean(src.migratedFromAssignment),
  };
}
