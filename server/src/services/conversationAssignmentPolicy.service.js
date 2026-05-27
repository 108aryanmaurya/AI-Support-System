import { hasOrgPermission } from '@ai-support/shared';
import { HttpError } from '../utils/httpError.js';

/**
 * Human assignment change policy (automation bypasses).
 *
 * @param {object} params
 * @param {{ id: string, role?: string } | null} params.actorMember
 * @param {string | null} params.priorAssigneeId
 * @param {string | null} params.nextAssigneeId
 * @param {unknown} params.permissions
 * @param {'manual' | 'claim'} [params.mode]
 */
export function assertConversationAssignmentAllowed({
  actorMember,
  priorAssigneeId,
  nextAssigneeId,
  permissions,
  mode = 'manual',
}) {
  const prior = priorAssigneeId || null;
  const next = nextAssigneeId || null;

  if (prior === next) {
    return { assignmentLogReason: mode === 'claim' ? 'claim' : 'manual' };
  }

  const actorId = actorMember?.id ?? null;
  if (!actorId) {
    throw new HttpError(500, 'Actor membership required for assignment changes.');
  }

  const canAssignOthers = hasOrgPermission(permissions, 'conversations.assign_others');
  const canAssignSelf = hasOrgPermission(permissions, 'conversations.assign_self');

  // Unassign (clear assignee)
  if (next === null) {
    if (canAssignOthers) {
      return { assignmentLogReason: prior ? 'unassign' : 'manual' };
    }
    if (prior === actorId) {
      return { assignmentLogReason: 'unassign' };
    }
    throw new HttpError(403, 'You cannot remove assignment from this conversation.');
  }

  // Claim / self-assign from unassigned
  if (prior === null && next === actorId) {
    if (!canAssignSelf) {
      throw new HttpError(403, 'You cannot assign conversations to yourself.');
    }
    return { assignmentLogReason: mode === 'claim' ? 'claim' : 'manual' };
  }

  // Reassign own thread to someone else, or change assignee when already assigned to self
  if (prior === actorId) {
    if (next === actorId) {
      return { assignmentLogReason: 'manual' };
    }
    if (canAssignOthers) {
      return { assignmentLogReason: 'manual' };
    }
    throw new HttpError(403, 'You cannot reassign this conversation to another agent.');
  }

  // Admin override: assign to any member or take from another
  if (canAssignOthers) {
    if (prior !== null && prior !== actorId && next === actorId) {
      return { assignmentLogReason: 'admin_override' };
    }
    return { assignmentLogReason: prior === null ? 'manual' : 'admin_override' };
  }

  // Agent assigning unassigned directly to someone else (not self)
  if (prior === null && next !== actorId) {
    throw new HttpError(403, 'You cannot assign this conversation to another agent.');
  }

  // Steal from another agent
  if (prior !== null && prior !== actorId && next === actorId) {
    throw new HttpError(
      403,
      'This conversation is assigned to another agent. You cannot take it over.',
    );
  }

  if (prior !== null && prior !== actorId && next !== actorId) {
    throw new HttpError(403, 'You cannot reassign another agent’s conversation.');
  }

  throw new HttpError(403, 'Assignment change is not allowed.');
}

/**
 * Customer-visible agent replies: assignee only, unless unassigned or admin override.
 *
 * @param {object} params
 * @param {{ id: string, role?: string } | null} params.actorMember
 * @param {string | null} [params.assignedToMemberId]
 * @param {unknown} params.permissions
 */
export function assertConversationCustomerReplyAllowed({
  actorMember,
  assignedToMemberId,
  permissions,
}) {
  const actorId = actorMember?.id ?? null;
  if (!actorId) {
    throw new HttpError(500, 'Actor membership required to send customer replies.');
  }

  if (!hasOrgPermission(permissions, 'messages.reply')) {
    throw new HttpError(403, 'You cannot send customer replies.');
  }

  const assignee = assignedToMemberId || null;
  if (!assignee || assignee === actorId) {
    return;
  }

  if (hasOrgPermission(permissions, 'conversations.assign_others')) {
    return;
  }

  throw new HttpError(
    403,
    'This conversation is assigned to another agent. Only the assignee can reply to the customer.',
  );
}
