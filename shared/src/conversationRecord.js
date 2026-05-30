/**
 * Normalize API / realtime conversation rows to a stable inbox shape (snake_case).
 */

/** @param {unknown} value */
function memberIdFromUnknown(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'object' && value !== null) {
    const nested = /** @type {Record<string, unknown>} */ (value);
    return memberIdFromUnknown(nested.id ?? nested.member_id ?? nested.memberId);
  }
  return null;
}

/** @param {unknown} raw */
export function pickAssignedMemberId(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const src = /** @type {Record<string, unknown>} */ (raw);
  return (
    memberIdFromUnknown(src.assigned_to_member_id) ??
    memberIdFromUnknown(src.assignedToMemberId) ??
    memberIdFromUnknown(src.assigned_to_member) ??
    memberIdFromUnknown(src.assignedToMember) ??
    null
  );
}

/** @param {unknown} raw */
export function normalizeConversationRecord(raw) {
  if (!raw || typeof raw !== 'object') return raw;

  const src = /** @type {Record<string, unknown>} */ (raw);
  const assigned_to_member_id = pickAssignedMemberId(src);

  const typeRaw = src.assignment_type ?? src.assignmentType;
  let assignment_type =
    typeof typeRaw === 'string' && typeRaw.trim() ? typeRaw.trim() : null;

  if (!assignment_type) {
    assignment_type = assigned_to_member_id ? 'assigned_to_agent' : 'unassigned';
  }

  const inbox_id =
    typeof src.inbox_id === 'string' && src.inbox_id.trim()
      ? src.inbox_id.trim()
      : typeof src.inboxId === 'string' && src.inboxId.trim()
        ? src.inboxId.trim()
        : null;

  return {
    ...src,
    assigned_to_member_id,
    assignment_type,
    inbox_id,
  };
}

/**
 * Merge conversation rows for inbox store (preserve assignment when realtime payload is stale).
 *
 * @param {unknown} prev — existing client row
 * @param {unknown} incoming — API or realtime row
 */
export function mergeConversationRecords(prev, incoming) {
  const a = normalizeConversationRecord(prev);
  const b = normalizeConversationRecord(incoming);

  if (!a) return b ?? null;
  if (!b) return a;

  const src = incoming && typeof incoming === 'object' ? /** @type {Record<string, unknown>} */ (incoming) : {};
  const hasAssignKey =
    Object.prototype.hasOwnProperty.call(src, 'assigned_to_member_id') ||
    Object.prototype.hasOwnProperty.call(src, 'assignedToMemberId');
  const hasTypeKey =
    Object.prototype.hasOwnProperty.call(src, 'assignment_type') ||
    Object.prototype.hasOwnProperty.call(src, 'assignmentType');

  let assigned_to_member_id = a.assigned_to_member_id ?? null;
  let assignment_type = a.assignment_type ?? 'unassigned';

  if (hasAssignKey) {
    assigned_to_member_id = b.assigned_to_member_id ?? null;
  }
  if (hasTypeKey) {
    assignment_type = b.assignment_type ?? assignment_type;
  } else if (hasAssignKey) {
    assignment_type = assigned_to_member_id ? 'assigned_to_agent' : 'unassigned';
  }

  // Avoid stale realtime / partial rows clearing a known assignee without an explicit unassign.
  if (
    a.assigned_to_member_id &&
    !assigned_to_member_id &&
    assignment_type !== 'unassigned' &&
    assignment_type !== 'assigned_to_ai'
  ) {
    assigned_to_member_id = a.assigned_to_member_id;
    assignment_type = a.assignment_type ?? 'assigned_to_agent';
  }

  const priorMeta =
    a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
  const nextMeta =
    b.metadata && typeof b.metadata === 'object' ? b.metadata : {};

  const {
    assigned_to_member_id: _dropAssignSnake,
    assignedToMemberId: _dropAssignCamel,
    assignment_type: _dropTypeSnake,
    assignmentType: _dropTypeCamel,
    metadata: _dropMeta,
    ...bRest
  } = b;

  return {
    ...a,
    ...bRest,
    assigned_to_member_id,
    assignment_type,
    metadata: { ...priorMeta, ...nextMeta },
    last_message_preview:
      b.last_message_preview ?? a.last_message_preview ?? null,
  };
}
