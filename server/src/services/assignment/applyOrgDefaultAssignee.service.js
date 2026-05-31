import { mergeDefaultAssignee } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { updateConversationFields } from '../conversationUpdate.service.js';
import { getOrgAssignmentSettings } from './assignmentSettings.service.js';

/**
 * Apply org default assignee when round-robin / balanced auto-route did not assign an agent.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyOrgDefaultAssigneeIfUnassigned({ organizationId, conversationId }) {
  const routing = await getOrgAssignmentSettings(organizationId);
  const da = mergeDefaultAssignee(routing.default_assignee);
  if (da.type === 'unassigned') {
    return { applied: false, reason: 'default_unassigned' };
  }

  const { data: conv, error } = await supabaseAdmin
    .from('conversations')
    .select('id, assigned_to_member_id, assignment_type, team_inbox_id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[assignment] default assignee load failed', {
      organization_id: organizationId,
      conversation_id: conversationId,
      error: error.message,
    });
    return { applied: false, reason: 'load_error' };
  }
  if (!conv) {
    return { applied: false, reason: 'not_found' };
  }

  if (conv.assigned_to_member_id) {
    return { applied: false, reason: 'already_assigned' };
  }
  if (conv.assignment_type === 'assigned_to_ai') {
    return { applied: false, reason: 'assigned_to_ai' };
  }

  if (da.type === 'inbox' && da.inboxId) {
    if (conv.team_inbox_id === da.inboxId && conv.assignment_type === 'assigned_to_team') {
      return { applied: false, reason: 'already_team_inbox' };
    }
    await updateConversationFields({
      organizationId,
      conversationId,
      actorUserId: null,
      teamInboxId: da.inboxId,
      assignmentType: 'assigned_to_team',
      automationSource: true,
    });
    return { applied: true, reason: 'inbox' };
  }

  if (da.type === 'member' && da.memberId) {
    const { data: member } = await supabaseAdmin
      .from('organization_members')
      .select('id')
      .eq('id', da.memberId)
      .eq('organization_id', organizationId)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (!member?.id) {
      return { applied: false, reason: 'invalid_member' };
    }
    await updateConversationFields({
      organizationId,
      conversationId,
      actorUserId: null,
      assignedToMemberId: da.memberId,
      automationSource: true,
    });
    return { applied: true, reason: 'member' };
  }

  return { applied: false, reason: 'invalid_default' };
}
