import { supabaseAdmin } from '../../../config/supabase.js';
import { notifyConversationAssignee } from '../../conversationAssignmentNotification.service.js';

/**
 * @param {object} job
 */
export async function handleNotifyAssignment(job) {
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

  await notifyConversationAssignee({
    organizationId,
    conversation,
    assignedToMemberId: p.assignedToMemberId ?? null,
    actorUserId: p.actorUserId ?? null,
    priorAssignedToMemberId: p.priorAssignedToMemberId ?? null,
  });
}
