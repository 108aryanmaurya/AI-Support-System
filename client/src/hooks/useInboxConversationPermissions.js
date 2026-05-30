import { useMemo } from 'react'
import {
  assignMemberDisabledReason,
  customerReplyDisabledReason,
  permissionDenialMessage,
} from '../lib/permissionUx.js'

/**
 * Inbox action gates for the active conversation (mirrors server RBAC).
 *
 * @param {object} params
 * @param {(key: string) => boolean} params.can
 * @param {string | null | undefined} params.myMemberId
 * @param {{ assigned_to_member_id?: string | null, is_spam?: boolean, status?: string } | null} params.conversation
 */
export function useInboxConversationPermissions({ can, myMemberId, conversation }) {
  return useMemo(() => {
    const assignee = conversation?.assigned_to_member_id ?? null

    const replyReason = customerReplyDisabledReason(can, myMemberId, assignee)
    const internalNoteReason = can('messages.internal_note')
      ? null
      : permissionDenialMessage('messages.internal_note')
    const spamReason = can('conversations.mark_spam') ? null : permissionDenialMessage('conversations.mark_spam')
    const closeReason = can('conversations.close') ? null : permissionDenialMessage('conversations.close')
    const aiReason = can('ai.use_copilot') ? null : permissionDenialMessage('ai.use_copilot')
    const canOpenAssignMenu =
      !conversation ||
      can('conversations.assign_others') ||
      can('conversations.assign_self') ||
      assignee === myMemberId

    const assignMenuReason = canOpenAssignMenu
      ? null
      : 'You cannot change assignment on conversations assigned to other agents.'

    return {
      reply: { restricted: Boolean(replyReason), reason: replyReason },
      internalNote: {
        restricted: Boolean(internalNoteReason),
        reason: internalNoteReason,
      },
      spam: { restricted: Boolean(spamReason), reason: spamReason },
      close: { restricted: Boolean(closeReason), reason: closeReason },
      aiCopilot: { restricted: Boolean(aiReason), reason: aiReason },
      assignMenu: { restricted: Boolean(assignMenuReason), reason: assignMenuReason },
      assignMember: (targetMemberId) => ({
        restricted: Boolean(
          assignMemberDisabledReason(can, myMemberId, assignee, targetMemberId ?? null),
        ),
        reason: assignMemberDisabledReason(can, myMemberId, assignee, targetMemberId ?? null),
      }),
      unassign: {
        restricted: Boolean(assignMemberDisabledReason(can, myMemberId, assignee, null)),
        reason: assignMemberDisabledReason(can, myMemberId, assignee, null),
      },
    }
  }, [can, myMemberId, conversation])
}
