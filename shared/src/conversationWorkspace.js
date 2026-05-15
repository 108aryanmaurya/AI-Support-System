/** Lifecycle / triage state on `conversations.status`. */
export const CONVERSATION_STATUSES = Object.freeze([
  'open',
  'pending',
  'waiting_customer',
  'resolved',
  'closed',
  'spam',
])

/** Routing priority on `conversations.priority`. */
export const CONVERSATION_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent'])

/** Queue semantics on `conversations.assignment_type` (orthogonal to `assigned_to_member_id`). */
export const CONVERSATION_ASSIGNMENT_TYPES = Object.freeze([
  'unassigned',
  'assigned_to_agent',
  'assigned_to_team',
  'assigned_to_ai',
])

/** Statuses shown in “active” inbox buckets (your inbox, unassigned). */
export const CONVERSATION_ACTIVE_STATUSES = Object.freeze(['open', 'pending', 'waiting_customer'])

/** @param {unknown} v */
export function isConversationStatus(v) {
  return typeof v === 'string' && CONVERSATION_STATUSES.includes(v)
}

/** @param {unknown} v */
export function isConversationPriority(v) {
  return typeof v === 'string' && CONVERSATION_PRIORITIES.includes(v)
}

/** @param {unknown} v */
export function isConversationAssignmentType(v) {
  return typeof v === 'string' && CONVERSATION_ASSIGNMENT_TYPES.includes(v)
}
