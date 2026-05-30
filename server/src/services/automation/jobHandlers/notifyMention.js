import { supabaseAdmin } from '../../../config/supabase.js';
import { notifyMentionedAgents } from '../../mentionNotification.service.js';

/**
 * @param {object} job
 */
export async function handleNotifyMention(job) {
  const p = job.payload ?? {};
  const organizationId = job.organization_id;

  let snippet = p.noteSnippet ?? '';
  if (!snippet && p.messageId) {
    const { data: msg } = await supabaseAdmin
      .from('messages')
      .select('content')
      .eq('id', p.messageId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    snippet = msg?.content ?? '';
  }

  await notifyMentionedAgents({
    organizationId,
    conversationId: p.conversationId,
    messageId: p.messageId,
    actorUserId: p.actorUserId,
    mentionedUserIds: p.mentionedUserIds ?? [],
    noteSnippet: snippet,
  });
}
