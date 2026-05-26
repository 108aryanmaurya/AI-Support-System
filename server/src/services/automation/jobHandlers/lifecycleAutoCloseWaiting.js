import { supabaseAdmin } from '../../../config/supabase.js';
import { createMessage } from '../../support.service.js';
import { updateConversationFromAutomation } from '../../conversationUpdate.service.js';
import { getOrgLifecycleSettings } from '../../lifecycle/lifecycleSettings.service.js';
import { logLifecycleStructured } from '../../lifecycle/lifecycleStructuredLog.service.js';
import {
  daysAgoIso,
  isWaitingCloseAfterReminderCandidate,
} from '../../lifecycle/lifecycleWaiting.js';

/**
 * Close `waiting_customer` after reminder + no further customer reply.
 */
export async function handleLifecycleAutoCloseWaiting(job) {
  const organizationId = job.organization_id;
  const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
  const conversationId =
    typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';

  if (!conversationId) {
    throw new Error('lifecycle.auto_close_waiting payload requires conversationId');
  }

  const lifecycle = await getOrgLifecycleSettings(organizationId);
  if (!lifecycle.enabled) {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.auto_close_waiting',
      outcome: 'skipped',
      reason: 'lifecycle_disabled',
    });
    return;
  }

  const closeCutoff =
    typeof payload.closeCutoff === 'string' && payload.closeCutoff
      ? payload.closeCutoff
      : daysAgoIso(lifecycle.waiting_auto_close_after_reminder_days);

  const { data: prior, error: loadErr } = await supabaseAdmin
    .from('conversations')
    .select(
      'id, status, waiting_status, channel_type, customer_reminder_sent_at, last_customer_message_at',
    )
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (loadErr) {
    throw new Error(loadErr.message || 'Failed to load conversation for waiting close');
  }
  if (!prior) {
    logLifecycleStructured('warn', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.auto_close_waiting',
      outcome: 'skipped',
      reason: 'conversation_not_found',
    });
    return;
  }

  if (prior.status === 'closed') {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.auto_close_waiting',
      outcome: 'skipped',
      reason: 'already_closed',
    });
    return;
  }

  if (!isWaitingCloseAfterReminderCandidate(prior, closeCutoff)) {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.auto_close_waiting',
      outcome: 'skipped',
      reason: 'not_eligible',
      status: prior.status,
      customer_reminder_sent_at: prior.customer_reminder_sent_at,
      last_customer_message_at: prior.last_customer_message_at,
      close_cutoff: closeCutoff,
    });
    return;
  }

  const startedAt = Date.now();

  await updateConversationFromAutomation({
    organizationId,
    conversationId,
    status: 'closed',
    closedReason: 'auto_no_reply_after_reminder',
    workflowMeta: {
      lifecycle: {
        auto_close_waiting: true,
        waiting_auto_close_after_reminder_days:
          lifecycle.waiting_auto_close_after_reminder_days,
        close_cutoff: closeCutoff,
      },
    },
  });

  await createMessage({
    organizationId,
    conversationId,
    senderType: 'system',
    senderUserId: null,
    senderMemberId: null,
    content: `Conversation closed automatically after no customer reply following our reminder (${lifecycle.waiting_auto_close_after_reminder_days} days).`,
    metadata: {
      lifecycle: {
        event: 'auto_close_waiting',
        waiting_auto_close_after_reminder_days:
          lifecycle.waiting_auto_close_after_reminder_days,
      },
    },
  });

  logLifecycleStructured('info', {
    organization_id: organizationId,
    conversation_id: conversationId,
    op: 'lifecycle.auto_close_waiting',
    outcome: 'closed',
    closed_reason: 'auto_no_reply_after_reminder',
    duration_ms: Date.now() - startedAt,
  });
}
