import { HttpError } from '../utils/httpError.js';
import { EmailAdapter } from '../adapters/EmailAdapter.js';
import { WebAdapter } from '../adapters/WebAdapter.js';
import { getConversation } from './emailReply.service.js';
import { fetchReplyCustomer } from './emailOutbound.service.js';

function normalizeConversationId(conversation_id) {
  const id = typeof conversation_id === 'string' ? conversation_id.trim() : '';
  if (!id) throw new HttpError(400, 'conversation_id is required.');
  return id;
}

async function fetchConversationRouting(conversationId) {
  const conversation = await getConversation(conversationId);
  if (!conversation?.channel_type) {
    throw new HttpError(400, 'Conversation is missing channel_type.');
  }
  return conversation;
}

async function loadReplyCustomer(conversation) {
  return fetchReplyCustomer(conversation.organization_id, conversation.customer_id);
}

/**
 * Single outbound reply router: ALWAYS uses `conversation.channel_type`.
 *
 * Email path passes `conversation` + `customer` into {@link EmailAdapter.sendMessage}.
 */
export async function sendReply(conversation_id, message) {
  const conversationId = normalizeConversationId(conversation_id);
  const conversation = await fetchConversationRouting(conversationId);

  switch (conversation.channel_type) {
    case 'email': {
      const customer = await loadReplyCustomer(conversation);
      const outcome = await EmailAdapter.sendMessage({ conversation, customer, message });
      if (!outcome.ok) {
        const errText = outcome.error || '';
        const isClientFault = /message cannot be empty|Customer email is missing|Conversation is missing|Conversation is not an email channel|missing assigned agent/i.test(
          errText,
        );
        throw new HttpError(isClientFault ? 400 : 502, errText || 'Failed to send email reply.');
      }
      return {
        status: outcome.status,
        ok: outcome.ok,
        conversationId: conversation.id,
        messageId: outcome.messageId,
        providerMessageId: outcome.external_message_id,
        external_message_id: outcome.external_message_id,
        provider: outcome.provider,
      };
    }
    case 'web':
      return WebAdapter.sendMessage({ conversation, message });
    case 'whatsapp':
    case 'messenger':
      throw new HttpError(501, `${conversation.channel_type} replies are not implemented yet.`);
    default:
      throw new HttpError(
        400,
        `Unsupported conversation channel_type: ${conversation.channel_type || 'unknown'}.`,
      );
  }
}

/**
 * Same routing as {@link sendReply}; does not persist a second message row (pending row owns persistence).
 */
export async function sendReplyOutbound(conversation_id, message) {
  const conversationId = normalizeConversationId(conversation_id);
  const conversation = await fetchConversationRouting(conversationId);

  switch (conversation.channel_type) {
    case 'email': {
      const customer = await loadReplyCustomer(conversation);
      return EmailAdapter.sendOutboundOnly({ conversation, customer, message });
    }
    case 'web':
      return WebAdapter.sendOutboundOnly({ conversation });
    case 'whatsapp':
    case 'messenger':
      throw new HttpError(501, `${conversation.channel_type} outbound replies are not implemented yet.`);
    default:
      throw new HttpError(
        400,
        `Unsupported conversation channel_type: ${conversation.channel_type || 'unknown'}.`,
      );
  }
}
