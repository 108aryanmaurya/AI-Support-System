/**
 * Org assignment routing preferences in `organizations.settings.assignment`.
 */

export const DEFAULT_ASSIGNEE_TYPES = Object.freeze(['unassigned', 'inbox', 'member']);

export const SELF_ASSIGN_ON_REPLY_MODES = Object.freeze(['assign_to_me', 'keep_queue']);

export const ASSIGNMENT_ROUTING_PREFERENCES_DEFAULTS = Object.freeze({
  default_assignee: Object.freeze({ type: 'unassigned' }),
  self_assign_on_reply: 'assign_to_me',
});

/**
 * @param {unknown} raw
 * @returns {{ type: 'unassigned' | 'inbox' | 'member', inboxId: string | null, memberId: string | null }}
 */
export function mergeDefaultAssignee(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const type =
    typeof src.type === 'string' && DEFAULT_ASSIGNEE_TYPES.includes(src.type)
      ? src.type
      : 'unassigned';

  if (type === 'inbox') {
    const inboxId =
      typeof src.inboxId === 'string' && src.inboxId.trim()
        ? src.inboxId.trim()
        : typeof src.inbox_id === 'string' && src.inbox_id.trim()
          ? src.inbox_id.trim()
          : null;
    return { type: 'inbox', inboxId, memberId: null };
  }

  if (type === 'member') {
    const memberId =
      typeof src.memberId === 'string' && src.memberId.trim()
        ? src.memberId.trim()
        : typeof src.member_id === 'string' && src.member_id.trim()
          ? src.member_id.trim()
          : null;
    return { type: 'member', inboxId: null, memberId };
  }

  return { type: 'unassigned', inboxId: null, memberId: null };
}

/**
 * @param {unknown} raw
 * @returns {'assign_to_me' | 'keep_queue'}
 */
export function mergeSelfAssignOnReply(raw) {
  return typeof raw === 'string' && SELF_ASSIGN_ON_REPLY_MODES.includes(raw)
    ? raw
    : ASSIGNMENT_ROUTING_PREFERENCES_DEFAULTS.self_assign_on_reply;
}

/**
 * @param {unknown} assignment — merged `settings.assignment` slice
 */
export function mergeAssignmentRoutingPreferences(assignment) {
  const src = assignment && typeof assignment === 'object' ? assignment : {};
  return {
    default_assignee: mergeDefaultAssignee(src.default_assignee),
    self_assign_on_reply: mergeSelfAssignOnReply(src.self_assign_on_reply),
  };
}

/**
 * Encode default assignee for API/UI select value.
 * @param {{ type: string, inboxId?: string | null, memberId?: string | null }} da
 */
export function defaultAssigneeSelectValue(da) {
  if (!da || da.type === 'unassigned') return 'unassigned';
  if (da.type === 'inbox' && da.inboxId) return `inbox:${da.inboxId}`;
  if (da.type === 'member' && da.memberId) return `member:${da.memberId}`;
  return 'unassigned';
}

/**
 * @param {unknown} value
 */
export function parseDefaultAssigneeSelectValue(value) {
  if (value === 'unassigned' || value == null || value === '') {
    return { type: 'unassigned', inboxId: null, memberId: null };
  }
  if (typeof value === 'string' && value.startsWith('inbox:')) {
    const inboxId = value.slice(6).trim();
    return inboxId
      ? { type: 'inbox', inboxId, memberId: null }
      : { type: 'unassigned', inboxId: null, memberId: null };
  }
  if (typeof value === 'string' && value.startsWith('member:')) {
    const memberId = value.slice(7).trim();
    return memberId
      ? { type: 'member', inboxId: null, memberId }
      : { type: 'unassigned', inboxId: null, memberId: null };
  }
  return { type: 'unassigned', inboxId: null, memberId: null };
}
