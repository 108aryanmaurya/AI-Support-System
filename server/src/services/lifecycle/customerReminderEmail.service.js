import {
  fetchReplyCustomer,
  resolveEmailReferencesHeaders,
  sendEmailViaProvider,
} from '../emailOutbound.service.js';
import { createMessage } from '../support.service.js';
import { syncEmailThreadsLastMessageId } from '../emailOutboundDbSync.service.js';
import { buildReminderBody, buildReminderSubject } from './lifecycleReminderContent.js';

export { buildReminderSubject, buildReminderBody };

/**
 * Send lifecycle customer reminder on email channel.
 *
 * @returns {Promise<{ outcome: 'sent'|'skipped'|'failed', reason?: string, messageId?: string }>}
 */
export async function sendCustomerLifecycleReminder({
  organizationId,
  conversation,
  waitingReminderDays,
  autoCloseAfterReminderDays,
}) {
  if (conversation.channel_type !== 'email') {
    return { outcome: 'skipped', reason: 'channel_not_email' };
  }

  const customer = await fetchReplyCustomer(organizationId, conversation.customer_id);
  if (!customer?.email?.trim()) {
    return { outcome: 'skipped', reason: 'customer_email_missing' };
  }

  const routing = await resolveEmailReferencesHeaders(organizationId, conversation.id);
  const subject = buildReminderSubject(
    conversation.subject ?? routing.threadSubject ?? null,
  );
  const body = buildReminderBody(
    customer,
    waitingReminderDays,
    autoCloseAfterReminderDays,
  );

  const convForSend = {
    ...conversation,
    subject,
  };

  const sendOutcome = await sendEmailViaProvider({
    conversation: convForSend,
    customer,
    message: body,
  });

  if (!sendOutcome.ok) {
    const err = sendOutcome.error ?? 'send_failed';
    const notReady =
      typeof err === 'string' &&
      (err.includes('not ready') ||
        err.includes('sending domain') ||
        err.includes('Missing Resend') ||
        err.includes('from_email'));
    return {
      outcome: notReady ? 'skipped' : 'failed',
      reason: notReady ? 'sending_not_configured' : err,
    };
  }

  const externalId =
    sendOutcome.external_message_id != null ? String(sendOutcome.external_message_id) : null;

  const message = await createMessage({
    organizationId,
    conversationId: conversation.id,
    senderType: 'system',
    senderUserId: null,
    senderMemberId: null,
    content: "Automated reminder sent to customer on date " + new Date().toISOString(),
    metadata: {
      channel: 'email',
      lifecycle: { event: 'customer_reminder' },
      status: 'sent',
      external_message_id: externalId,
      reminder_subject: subject,
    },
  });

  if (conversation.channel_type === 'email') {
    await syncEmailThreadsLastMessageId({
      organizationId,
      conversationId: conversation.id,
      messageId: message.id,
    });
  }

  return { outcome: 'sent', messageId: message.id };
}
