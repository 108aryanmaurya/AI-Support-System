import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { createMessage } from '../services/support.service.js';

function normalizeOutgoingBody(message) {
  return typeof message === 'string' ? message.trim() : '';
}

async function resolveAssignedMember(organizationId, assignedToMemberId) {
  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('id, user_id')
    .eq('organization_id', organizationId)
    .eq('id', assignedToMemberId)
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to resolve agent member.');
  if (!data?.user_id) {
    throw new HttpError(400, 'Conversation assigned member is invalid or missing user.');
  }
  return data;
}

export class WebAdapter {
  /**
   * Persist outbound agent row; subscribed clients receive it via Postgres Realtime on `messages`.
   */
  static async sendMessage({ conversation, message }) {
    const content = normalizeOutgoingBody(message);
    if (!content) throw new HttpError(400, 'message cannot be empty.');

    if (conversation.channel_type !== 'web') {
      throw new HttpError(400, 'WebAdapter requires channel_type web.');
    }
    if (!conversation.assigned_to_member_id) {
      throw new HttpError(400, 'Conversation is missing assigned agent member.');
    }

    const member = await resolveAssignedMember(
      conversation.organization_id,
      conversation.assigned_to_member_id,
    );

    const row = await createMessage({
      organizationId: conversation.organization_id,
      conversationId: conversation.id,
      senderType: 'agent',
      senderUserId: member.user_id,
      senderMemberId: member.id,
      content,
      metadata: {
        channel: 'web',
        status: 'sent',
      },
    });

    return {
      status: 'sent',
      conversationId: conversation.id,
      messageId: row.id,
      providerMessageId: null,
    };
  }

  /**
   * Inbox inserts the message first; web channel delivery is already handled by realtime on INSERT — no duplicate write.
   */
  static async sendOutboundOnly({ conversation }) {
    if (conversation.channel_type !== 'web') {
      throw new HttpError(400, 'WebAdapter outbound requires channel_type web.');
    }
    return { provider: 'web_realtime', providerMessageId: null };
  }
}
