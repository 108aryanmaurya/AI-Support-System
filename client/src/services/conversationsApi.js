/**
 * Org-scoped conversation workspace API (assignment, status, priority).
 * Server: PATCH `/api/org/:orgId/conversations/:conversationId`
 */
import { normalizeConversationRecord } from '@ai-support/shared'
import { apiFetch } from './api.js'
import { patchConversationUrl } from './inboxApi.js'

/**
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {Record<string, unknown>} patch
 * @returns {Promise<{ conversation: object }>}
 */
export async function patchConversation(organizationId, conversationId, patch) {
  if (!organizationId?.trim()) {
    throw new Error('Organization id is required to update a conversation.')
  }
  if (!conversationId?.trim()) {
    throw new Error('Conversation id is required.')
  }

  const data = await apiFetch(patchConversationUrl(organizationId, conversationId), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (data?.conversation) {
    data.conversation = normalizeConversationRecord(data.conversation)
  }
  return data
}

/**
 * Assign or unassign a human agent on a conversation.
 *
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {string | null} memberId — `organization_members.id`, or null to unassign
 */
export async function assignConversationToMember(organizationId, conversationId, memberId) {
  if (memberId != null && String(memberId).trim()) {
    return patchConversation(organizationId, conversationId, {
      assignedToMemberId: String(memberId).trim(),
      assignmentType: 'assigned_to_agent',
    })
  }
  // Clear assignee only; server keeps team_inbox_id and may set queue to assigned_to_team.
  return patchConversation(organizationId, conversationId, {
    assignedToMemberId: null,
  })
}

/**
 * Assign or clear team inbox queue on a conversation.
 *
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {string | null} inboxId — `inboxes.id`, or null to clear team queue
 */
export async function assignConversationToTeamInbox(organizationId, conversationId, inboxId) {
  const patch =
    inboxId != null && String(inboxId).trim()
      ? {
          teamInboxId: String(inboxId).trim(),
          assignmentType: 'assigned_to_team',
          assignedToMemberId: null,
        }
      : { teamInboxId: null }

  return patchConversation(organizationId, conversationId, patch)
}
