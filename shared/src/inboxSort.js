/**
 * Production inbox ordering:
 * 1) Unassigned first
 * 2) Assigned to current agent (myMemberId)
 * 3) All other assignments
 * Within each tier: last_message_at descending (newest first).
 *
 * sortConversationsInbox is O(n log n). Spam inclusion is a filter concern — this only orders the given list.
 */

export function lastMessageMs(conversation) {
  return new Date(conversation?.last_message_at ?? 0).getTime()
}

/**
 * @param {unknown} conversation
 * @param {string | null | undefined} myMemberId organization_members.id for the signed-in user in this org
 * @returns {0 | 1 | 2}
 */
export function inboxSortTier(conversation, myMemberId) {
  if (conversation == null) return 2
  if (!conversation.assigned_to_member_id) return 0
  if (myMemberId != null && conversation.assigned_to_member_id === myMemberId) return 1
  return 2
}

export function compareConversationsInbox(a, b, myMemberId) {
  const ta = inboxSortTier(a, myMemberId)
  const tb = inboxSortTier(b, myMemberId)
  if (ta !== tb) return ta - tb
  return lastMessageMs(b) - lastMessageMs(a)
}

/**
 * @param {unknown[]} items
 * @param {string | null | undefined} myMemberId
 */
export function sortConversationsInbox(items, myMemberId) {
  if (!items?.length) return []
  const mid = myMemberId ?? null
  return [...items].sort((a, b) => compareConversationsInbox(a, b, mid))
}
