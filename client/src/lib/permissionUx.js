/** User-facing copy when an action is blocked by org capabilities. */
export const PERMISSION_DENIAL_MESSAGES = Object.freeze({
  'conversations.assign_self':
    'You cannot assign conversations to yourself. Ask an admin to enable self-assignment.',
  'conversations.assign_others':
    'Only workspace admins can assign or reassign conversations for other agents.',
  'conversations.unassign':
    'You cannot remove assignment from conversations owned by other agents.',
  'conversations.mark_spam': 'Marking spam is limited to workspace admins.',
  'conversations.close': 'Closing conversations is not allowed for your role.',
  'conversations.merge': 'Merging conversations is not available for your role.',
  'messages.reply': 'Sending customer replies is disabled for your role.',
  'messages.internal_note': 'Internal notes are disabled for your role.',
  'messages.retry_failed': 'Retrying failed outbound messages is limited to admins.',
  'ai.use_copilot': 'AI copilot is disabled for your role. Contact a workspace admin.',
  'ai.manage_settings': 'AI settings are limited to workspace admins.',
  'ai.manage_workflows': 'Workflow rules are limited to workspace admins.',
  'automation.manage_assignment': 'Assignment settings are limited to workspace admins.',
  'automation.manage_sla': 'SLA and automation settings are limited to workspace admins.',
  'automation.view_logs': 'Automation logs are limited to workspace admins.',
  'team.invite': 'Inviting teammates is limited to workspace admins.',
  'team.manage_members': 'Managing teammates is limited to workspace admins.',
  'analytics.view_org': 'Organization-wide reports are limited to workspace admins.',
  'channels.manage_email': 'Email channel setup is limited to workspace admins.',
  'channels.manage_webhooks': 'Webhook configuration is limited to workspace admins.',
})

const CONTEXTUAL = Object.freeze({
  reply_not_assignee:
    'This conversation is assigned to another agent. Only the assignee can reply to the customer.',
  reply_no_permission: PERMISSION_DENIAL_MESSAGES['messages.reply'],
  assign_steal:
    'This conversation is assigned to another agent. You cannot take it over or reassign it.',
  assign_other_agent:
    'You cannot assign this conversation to another agent.',
  assign_unassign_other: 'You cannot unassign a conversation owned by another agent.',
  auto_assign_unassigned_only:
    'Auto-assign only applies to unassigned conversations you open.',
  auto_assign_no_self: 'You cannot use auto-assign without self-assignment permission.',
})

/**
 * @param {string} permissionKey
 */
export function permissionDenialMessage(permissionKey) {
  return PERMISSION_DENIAL_MESSAGES[permissionKey] ?? 'This action is not allowed for your role.'
}

/**
 * @param {(key: string) => boolean} can
 * @param {string | null | undefined} actorMemberId
 * @param {string | null | undefined} priorAssigneeId
 * @param {string | null | undefined} targetMemberId — null = unassign
 */
export function assignMemberDisabledReason(can, actorMemberId, priorAssigneeId, targetMemberId) {
  const actor = actorMemberId || null
  const prior = priorAssigneeId || null
  const next = targetMemberId || null

  if (!actor) return 'Sign in to change assignment.'

  if (next === null) {
    if (!prior) return 'Conversation is already unassigned.'
    if (prior === actor) return null
    if (can('conversations.assign_others')) return null
    return CONTEXTUAL.assign_unassign_other
  }

  if (prior === next) return 'Already assigned to this agent.'

  if (prior === null && next === actor) {
    return can('conversations.assign_self') ? null : permissionDenialMessage('conversations.assign_self')
  }

  if (prior === actor && next !== actor) {
    return can('conversations.assign_others') ? null : CONTEXTUAL.assign_other_agent
  }

  if (can('conversations.assign_others')) return null

  if (prior !== null && prior !== actor && next === actor) {
    return CONTEXTUAL.assign_steal
  }

  if (prior === null && next !== actor) {
    return CONTEXTUAL.assign_other_agent
  }

  if (prior !== null && prior !== actor) {
    return CONTEXTUAL.assign_steal
  }

  return CONTEXTUAL.assign_other_agent
}

/**
 * @param {(key: string) => boolean} can
 * @param {string | null | undefined} actorMemberId
 * @param {string | null | undefined} assigneeId
 */
export function customerReplyDisabledReason(can, actorMemberId, assigneeId) {
  if (!can('messages.reply')) return CONTEXTUAL.reply_no_permission
  const actor = actorMemberId || null
  const assignee = assigneeId || null
  if (!assignee || !actor || assignee === actor) return null
  if (can('conversations.assign_others')) return null
  return CONTEXTUAL.reply_not_assignee
}
