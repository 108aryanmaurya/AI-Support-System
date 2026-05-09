import { extractInboundEmailPayload } from '../utils/emailWebhook.js';
import { sendEmailViaProvider } from '../services/emailOutbound.service.js';
import { persistAgentOutboundMessage } from '../services/emailReply.service.js';
import { syncEmailThreadsLastMessageId } from '../services/emailOutboundDbSync.service.js';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

function normalizeBody(message) {
  return typeof message === 'string' ? message.trim() : '';
}

/**
 * @typedef {object} EmailSendMessageResult
 * @property {boolean} ok
 * @property {string|null} [external_message_id] Provider / Resend id on success
 * @property {string|null} [error] When `ok` is false
 * @property {string|null} [messageId] Persisted row id when message was stored
 * @property {string} [status] Sent / failed summary for convenience
 */

export class EmailAdapter {
  /**
   * Full reply: send through provider, then persist agent message (success or failure metadata).
   * @param {object} params
   * @param {object} params.conversation Loaded conversation row (`channel_type === 'email'`).
   * @param {object} params.customer Customer row (`email` may be empty → failed result).
   * @param {string} params.message Plain-text body.
   * @returns {Promise<EmailSendMessageResult>}
   */
  static async sendMessage({ conversation, customer, message }) {
    const body = normalizeBody(message);
    if (!body) {
      return {
        ok: false,
        status: 'failed',
        external_message_id: null,
        error: 'message cannot be empty.',
        messageId: null,
      };
    }

    const recipientOk =
      typeof customer?.email === 'string' && customer.email.trim().length > 0;
    if (!recipientOk) {
      return {
        ok: false,
        status: 'failed',
        external_message_id: null,
        error: 'Customer email is missing.',
        messageId: null,
      };
    }

    if (conversation.channel_type !== 'email') {
      return {
        ok: false,
        status: 'failed',
        external_message_id: null,
        error: 'Conversation is not an email channel.',
        messageId: null,
      };
    }

    if (!conversation.channel_id) {
      return {
        ok: false,
        status: 'failed',
        external_message_id: null,
        error: 'Conversation is missing channel_id.',
        messageId: null,
      };
    }

    if (!conversation.assigned_to_member_id) {
      return {
        ok: false,
        status: 'failed',
        external_message_id: null,
        error: 'Conversation is missing assigned agent member.',
        messageId: null,
      };
    }

    const sendOutcome = await sendEmailViaProvider({
      conversation,
      customer,
      message: body,
    });

    if (!sendOutcome.ok) {
      const failedRow = await persistAgentOutboundMessage({
        organizationId: conversation.organization_id,
        conversationId: conversation.id,
        senderMemberId: conversation.assigned_to_member_id,
        content: body,
        metadata: {
          status: 'failed',
        },
      });

      return {
        ok: false,
        status: 'failed',
        external_message_id: null,
        error: sendOutcome.error ?? 'Send failed',
        messageId: failedRow.id,
        provider: sendOutcome.provider,
      };
    }

    const extId =
      sendOutcome.external_message_id != null
        ? String(sendOutcome.external_message_id)
        : null;

    const saved = await persistAgentOutboundMessage({
      organizationId: conversation.organization_id,
      conversationId: conversation.id,
      senderMemberId: conversation.assigned_to_member_id,
      content: body,
      metadata: {
        status: 'sent',
        external_message_id: extId,
        channel: 'email',
      },
    });

    await syncEmailThreadsLastMessageId({
      organizationId: conversation.organization_id,
      conversationId: conversation.id,
      messageId: saved.id,
    });

    await supabaseAdmin
      .from('conversations')
      .update({ last_message_at: saved.created_at })
      .eq('id', conversation.id)
      .eq('organization_id', conversation.organization_id);

    return {
      ok: true,
      status: 'sent',
      external_message_id: sendOutcome.external_message_id ?? null,
      error: null,
      messageId: saved.id,
      provider: sendOutcome.provider ?? 'resend',
      conversationId: conversation.id,
    };
  }

  /** Outbound provider call only — caller owns the pending `messages` row. */
  static async sendOutboundOnly({ conversation, customer, message }) {
    const body = normalizeBody(message);
    if (!body) {
      throw new HttpError(400, 'message cannot be empty.');
    }

    const outcome = await sendEmailViaProvider({
      conversation,
      customer,
      message: body,
    });

    if (!outcome.ok) {
      throw new HttpError(502, outcome.error || 'Outbound email failed.');
    }

    return {
      provider: outcome.provider ?? 'resend',
      providerMessageId: outcome.external_message_id ?? null,
      external_message_id: outcome.external_message_id ?? null,
    };
  }

  static parseIncoming(payload) {
    return extractInboundEmailPayload(payload);
  }
}
