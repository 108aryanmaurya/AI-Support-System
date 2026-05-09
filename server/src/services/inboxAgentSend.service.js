import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { ensureOrgMembership } from './support.service.js';
import { getConversation } from './emailReply.service.js';
import { sendReplyOutbound } from './channelReplyRouter.service.js';
import { sanitizeMessage, getMaxMessageLength } from '../utils/incomingMessageValidation.js';
import {
  replaceMessageMetadataExact,
  syncEmailThreadsLastMessageId,
} from './emailOutboundDbSync.service.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_MESSAGE_LENGTH = getMaxMessageLength();

async function patchConversationActivity(conversationId, organizationId, createdAtIso) {
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: createdAtIso })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (error) throw new HttpError(500, error.message || 'Failed to refresh conversation activity.');
}

/**
 * Inbox send: insert pending agent row → outbound send → mark sent/failed on same row.
 */
export async function sendInboxAgentOutboundMessage({ userId, conversationId: rawConversationId, rawContent }) {
  const conversationId =
    typeof rawConversationId === 'string' ? rawConversationId.trim() : '';

  if (!conversationId) throw new HttpError(400, 'conversation_id is required.');
  if (!UUID_V4_REGEX.test(conversationId)) throw new HttpError(400, 'conversation_id must be a valid UUID.');
  if (typeof rawContent !== 'string') throw new HttpError(400, 'content is required.');

  const body = sanitizeMessage(rawContent);
  if (!body) throw new HttpError(400, 'content cannot be empty.');
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new HttpError(400, `content exceeds max length of ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const conversation = await getConversation(conversationId);
  const member = await ensureOrgMembership(userId, conversation.organization_id);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('messages')
    .insert({
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      sender_type: 'agent',
      sender_user_id: userId,
      sender_member_id: member.id,
      content: body,
      metadata: {
        status: 'pending',
      },
    })
    .select('*')
    .single();

  if (insertError) {
    if (insertError.code === '23514') throw new HttpError(400, insertError.message || 'Message validation failed.');
    throw new HttpError(500, insertError.message || 'Failed to create message.');
  }

  try {
    const outbound = await sendReplyOutbound(conversation.id, body);

    let updated;
    if (conversation.channel_type === 'email') {
      const externalId =
        outbound.providerMessageId != null ? String(outbound.providerMessageId) : null;
      updated = await replaceMessageMetadataExact({
        organizationId: conversation.organization_id,
        messageId: inserted.id,
        metadata: {
          status: 'sent',
          external_message_id: externalId,
          channel: 'email',
        },
      });

      await syncEmailThreadsLastMessageId({
        organizationId: conversation.organization_id,
        conversationId: conversation.id,
        messageId: inserted.id,
      });
    } else {
      updated = await replaceMessageMetadataExact({
        organizationId: conversation.organization_id,
        messageId: inserted.id,
        metadata: {
          status: 'sent',
          channel: conversation.channel_type,
        },
      });
    }

    await patchConversationActivity(conversation.id, conversation.organization_id, updated.created_at);

    return {
      message: updated,
      outbound,
      deliveryStatus: 'sent',
    };
  } catch (err) {
    await replaceMessageMetadataExact({
      organizationId: conversation.organization_id,
      messageId: inserted.id,
      metadata: {
        status: 'failed',
      },
    });

    throw err;
  }
}
