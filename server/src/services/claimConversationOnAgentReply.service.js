import { mergeSelfAssignOnReply } from '@ai-support/shared';
import { HttpError } from '../utils/httpError.js';
import { getOrgAssignmentSettings } from './assignment/assignmentSettings.service.js';
import { updateConversationFields } from './conversationUpdate.service.js';

/**
 * Self-assign when an agent replies to an unassigned or team-inbox thread, unless org setting is keep_queue.
 * Skips when a human assignee already exists.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.organizationId
 * @param {Record<string, unknown>} params.conversation
 * @param {{ id: string, role?: string }} params.actorMember
 * @param {unknown} params.permissions
 * @returns {Promise<{ conversation: Record<string, unknown>, claimed: boolean }>}
 */
export async function claimConversationOnAgentReplyIfUnassigned({
  userId,
  organizationId,
  conversation,
  actorMember,
  permissions,
}) {
  const conversationId =
    typeof conversation?.id === 'string' ? conversation.id.trim() : '';
  if (!conversationId) {
    throw new HttpError(500, 'Conversation id missing for claim-on-reply.');
  }

  const priorAssignee = conversation.assigned_to_member_id ?? null;
  if (priorAssignee) {
    return { conversation, claimed: false };
  }

  const routing = await getOrgAssignmentSettings(organizationId);
  const selfAssignMode = mergeSelfAssignOnReply(routing.self_assign_on_reply);
  if (selfAssignMode === 'keep_queue') {
    return { conversation, claimed: false };
  }

  const assignmentType = conversation.assignment_type ?? 'unassigned';
  if (assignmentType === 'assigned_to_ai') {
    return { conversation, claimed: false };
  }

  if (conversation.status === 'spam') {
    return { conversation, claimed: false };
  }

  const { conversation: updated } = await updateConversationFields({
    organizationId,
    conversationId,
    actorUserId: userId,
    assignedToMemberId: actorMember.id,
    assignmentMode: 'claim',
    orgPermissions: permissions,
  });

  return { conversation: updated, claimed: true };
}
