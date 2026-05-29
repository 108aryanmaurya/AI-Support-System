import { HttpError } from '../utils/httpError.js';
import { EmailAdapter } from '../adapters/EmailAdapter.js';
import { WebAdapter } from '../adapters/WebAdapter.js';
import { getConversation } from './emailReply.service.js';
import {
  fetchReplyCustomer,
  resolveOutboundEmailChannelId,
  sendEmailViaProvider,
} from './emailOutbound.service.js';
import { isValidEmail, normalizeEmail } from '../utils/incomingMessageValidation.js';

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
 * Sends via Resend when the customer has email and the org has an active email channel.
 * @returns {Promise<{ ok: true, provider: string, providerMessageId: string|null, external_message_id: string|null }|{ ok: false, error: string }|null>}
 *   `null` when email was not attempted (no recipient).
 */
async function deliverCustomerEmailIfPossible(conversation, message) {
  const customer = await loadReplyCustomer(conversation);
  const recipient = normalizeEmail(customer?.email ?? '');
  if (!recipient || !isValidEmail(recipient)) {
    return null;
  }

  const channelId = await resolveOutboundEmailChannelId(conversation);
  if (!channelId) {
    return {
      ok: false,
      error: 'No active email channel configured for this organization.',
    };
  }

  const outcome = await sendEmailViaProvider({
    conversation: { ...conversation, channel_id: channelId },
    customer,
    message,
  });

  if (!outcome.ok) {
    return { ok: false, error: outcome.error || 'Outbound email failed.' };
  }

  return {
    ok: true,
    provider: outcome.provider ?? 'resend',
    providerMessageId: outcome.external_message_id ?? null,
    external_message_id: outcome.external_message_id ?? null,
  };
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
        const isClientFault = /message cannot be empty|Customer email is missing|Conversation is missing|missing assigned agent|No active email channel/i.test(
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
 * Delivers to the customer by email when possible, then channel-specific side effects
 * (e.g. web realtime). Does not persist a second message row.
 */
export async function sendReplyOutbound(conversation_id, message) {
  const conversationId = normalizeConversationId(conversation_id);
  const conversation = await fetchConversationRouting(conversationId);

  const emailDelivery = await deliverCustomerEmailIfPossible(conversation, message);

  if (conversation.channel_type === 'email') {
    if (emailDelivery == null) {
      throw new HttpError(400, 'Customer email is missing.');
    }
    if (!emailDelivery.ok) {
      const errText = emailDelivery.error || '';
      const isClientFault = /message cannot be empty|Customer email is missing|No active email channel/i.test(
        errText,
      );
      throw new HttpError(isClientFault ? 400 : 502, errText || 'Outbound email failed.');
    }
    return emailDelivery;
  }

  switch (conversation.channel_type) {
    case 'web': {
      const web = await WebAdapter.sendOutboundOnly({ conversation });
      if (emailDelivery?.ok) {
        return { ...web, emailDelivery };
      }
      if (emailDelivery && !emailDelivery.ok) {
        // eslint-disable-next-line no-console
        console.warn('[sendReplyOutbound] web conversation email sidecar failed', {
          organization_id: conversation.organization_id,
          conversation_id: conversation.id,
          error: emailDelivery.error,
        });
      }
      return web;
    }
    case 'whatsapp':
    case 'messenger': {
      if (emailDelivery?.ok) {
        return emailDelivery;
      }
      if (emailDelivery && !emailDelivery.ok) {
        const errText = emailDelivery.error || '';
        const isClientFault = /Customer email is missing|No active email channel/i.test(errText);
        throw new HttpError(isClientFault ? 400 : 502, errText || 'Outbound email failed.');
      }
      throw new HttpError(501, `${conversation.channel_type} outbound replies are not implemented yet.`);
    }
    default:
      throw new HttpError(
        400,
        `Unsupported conversation channel_type: ${conversation.channel_type || 'unknown'}.`,
      );
  }
}
