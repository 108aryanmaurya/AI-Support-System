import { lifecycleCustomerReminderIdempotencyKey } from '@ai-support/shared';
import { supabaseAdmin } from '../../../config/supabase.js';
import { emitSupportEvent } from '../../analytics/supportEvents.service.js';
import { getOrgLifecycleSettings } from '../../lifecycle/lifecycleSettings.service.js';
import { sendCustomerLifecycleReminder } from '../../lifecycle/customerReminderEmail.service.js';
import { logLifecycleStructured } from '../../lifecycle/lifecycleStructuredLog.service.js';
import {
  customerRepliedSinceWaiting,
  daysAgoIso,
  isWaitingReminderCandidate,
  waitingReminderAnchor,
} from '../../lifecycle/lifecycleWaiting.js';

/**
 * Send one customer reminder email for a `waiting_customer` conversation.
 */
export async function handleLifecycleSendCustomerReminder(job) {
  const organizationId = job.organization_id;
  const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
  const conversationId =
    typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';

  if (!conversationId) {
    throw new Error('lifecycle.send_customer_reminder payload requires conversationId');
  }

  const lifecycle = await getOrgLifecycleSettings(organizationId);
  if (!lifecycle.enabled) {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.send_customer_reminder',
      outcome: 'skipped',
      reason: 'lifecycle_disabled',
    });
    return;
  }

  if (!lifecycle.customer_reminder_enabled) {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.send_customer_reminder',
      outcome: 'skipped',
      reason: 'customer_reminder_disabled',
    });
    emitSupportEvent({
      organizationId,
      eventType: 'lifecycle.reminder_skipped',
      entityType: 'conversation',
      entityId: conversationId,
      payload: { reason: 'customer_reminder_disabled' },
    });
    return;
  }

  const reminderCutoff =
    typeof payload.reminderCutoff === 'string' && payload.reminderCutoff
      ? payload.reminderCutoff
      : daysAgoIso(lifecycle.waiting_reminder_days);

  const { data: row, error: loadErr } = await supabaseAdmin
    .from('conversations')
    .select(
      'id, organization_id, customer_id, status, waiting_status, channel_type, channel_id, subject, last_customer_message_at, last_agent_message_at, last_message_at, created_at, customer_reminder_sent_at',
    )
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (loadErr) {
    throw new Error(loadErr.message || 'Failed to load conversation for reminder');
  }
  if (!row) {
    logLifecycleStructured('warn', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.send_customer_reminder',
      outcome: 'skipped',
      reason: 'conversation_not_found',
    });
    return;
  }

  if (row.waiting_status !== 'waiting_customer') {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.send_customer_reminder',
      outcome: 'skipped',
      reason: 'status_changed',
      status: row.status,
    });
    return;
  }

  if (row.customer_reminder_sent_at) {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.send_customer_reminder',
      outcome: 'skipped',
      reason: 'reminder_already_sent',
    });
    return;
  }

  if (customerRepliedSinceWaiting(row)) {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.send_customer_reminder',
      outcome: 'skipped',
      reason: 'customer_replied',
    });
    emitSupportEvent({
      organizationId,
      eventType: 'lifecycle.reminder_skipped',
      entityType: 'conversation',
      entityId: conversationId,
      channelType: row.channel_type ?? null,
      payload: { reason: 'customer_replied' },
    });
    return;
  }

  if (!isWaitingReminderCandidate(row, reminderCutoff)) {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.send_customer_reminder',
      outcome: 'skipped',
      reason: 'not_due',
      anchor: waitingReminderAnchor(row),
      reminder_cutoff: reminderCutoff,
    });
    return;
  }

  const startedAt = Date.now();
  const sendResult = await sendCustomerLifecycleReminder({
    organizationId,
    conversation: row,
    waitingReminderDays: lifecycle.waiting_reminder_days,
    autoCloseAfterReminderDays: lifecycle.waiting_auto_close_after_reminder_days,
  });

  if (sendResult.outcome === 'skipped') {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.send_customer_reminder',
      outcome: 'skipped',
      reason: sendResult.reason ?? 'skipped',
      duration_ms: Date.now() - startedAt,
    });
    emitSupportEvent({
      organizationId,
      eventType: 'lifecycle.reminder_skipped',
      entityType: 'conversation',
      entityId: conversationId,
      channelType: row.channel_type ?? null,
      payload: { reason: sendResult.reason ?? 'skipped' },
    });
    return;
  }

  if (sendResult.outcome === 'failed') {
    throw new Error(sendResult.reason ?? 'customer_reminder_send_failed');
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('conversations')
    .update({ customer_reminder_sent_at: now })
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .eq('waiting_status', 'waiting_customer')
    .is('customer_reminder_sent_at', null)
    .select('id')
    .maybeSingle();

  if (claimErr) {
    throw new Error(claimErr.message || 'Failed to record customer_reminder_sent_at');
  }

  if (!claimed) {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.send_customer_reminder',
      outcome: 'skipped',
      reason: 'reminder_claim_lost',
    });
    return;
  }

  emitSupportEvent({
    organizationId,
    eventType: 'lifecycle.reminder_sent',
    entityType: 'conversation',
    entityId: conversationId,
    channelType: row.channel_type ?? null,
    payload: {
      message_id: sendResult.messageId ?? null,
      waiting_reminder_days: lifecycle.waiting_reminder_days,
    },
  });

  logLifecycleStructured('info', {
    organization_id: organizationId,
    conversation_id: conversationId,
    op: 'lifecycle.send_customer_reminder',
    outcome: 'sent',
    message_id: sendResult.messageId ?? null,
    duration_ms: Date.now() - startedAt,
    idempotency_key: lifecycleCustomerReminderIdempotencyKey(organizationId, conversationId),
  });
}
