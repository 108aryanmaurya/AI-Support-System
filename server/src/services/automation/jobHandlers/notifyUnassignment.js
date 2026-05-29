import { supabaseAdmin } from '../../../config/supabase.js';
import { notifyConversationPriorAssigneeUnassigned } from '../../conversationAssignmentNotification.service.js';

/**
 * @param {object} job
 */
export async function handleNotifyUnassignment(job) {
  const p = job.payload ?? {};
  const organizationId = job.organization_id;

  let conversation = p.conversation;
  if (!conversation?.id && p.conversationId) {
    const { data } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', p.conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    conversation = data;
  }

  await notifyConversationPriorAssigneeUnassigned({
    organizationId,
    conversation,
    priorAssignedToMemberId: p.priorAssignedToMemberId ?? null,
    assignedToMemberId: p.assignedToMemberId ?? null,
    actorUserId: p.actorUserId ?? null,
  });
}
