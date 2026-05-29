import {
  lifecycleAutoCloseResolvedIdempotencyKey,
  lifecycleAutoCloseWaitingIdempotencyKey,
  lifecycleCustomerReminderIdempotencyKey,
  lifecycleScanOrgIdempotencyKey,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../../config/supabase.js';
import { enqueueAutomationJob } from '../enqueueJob.service.js';
import { getOrgLifecycleSettings } from '../../lifecycle/lifecycleSettings.service.js';
import { logLifecycleStructured } from '../../lifecycle/lifecycleStructuredLog.service.js';
import {
  LIFECYCLE_AUTO_CLOSE_BATCH_LIMIT,
  resolvedIdleCutoffIso,
} from '../../lifecycle/lifecycleIdleResolved.js';
import {
  LIFECYCLE_WAITING_BATCH_LIMIT,
  daysAgoIso,
  isWaitingCloseAfterReminderCandidate,
  isWaitingReminderCandidate,
} from '../../lifecycle/lifecycleWaiting.js';

/**
 * Org lifecycle cron: idle resolved auto-close, waiting reminders, waiting auto-close.
 */
export async function handleLifecycleScanOrg(job) {
  const organizationId = job.organization_id;
  const lifecycle = await getOrgLifecycleSettings(organizationId);

  if (!lifecycle.enabled) {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      op: 'lifecycle.scan_org',
      outcome: 'skipped',
      reason: 'lifecycle_disabled',
    });
    return;
  }
console.log('lifecycleScanOrg');
  const startedAt = Date.now();
  const resolvedCutoff = resolvedIdleCutoffIso(lifecycle.resolved_auto_close_days);
  const reminderCutoff = daysAgoIso(lifecycle.waiting_reminder_days);
  const waitingCloseCutoff = daysAgoIso(lifecycle.waiting_auto_close_after_reminder_days);

  const { data: resolvedRows, error: resolvedErr } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('status', 'resolved')
    .eq('is_spam', false)
    .lt('last_message_at', resolvedCutoff)
    .order('last_message_at', { ascending: true })
    .limit(LIFECYCLE_AUTO_CLOSE_BATCH_LIMIT);

  if (resolvedErr) {
    throw new Error(resolvedErr.message || 'lifecycle resolved scan failed');
  }

  let enqueuedResolved = 0;
  console.log('resolvedRows', resolvedRows);
  for (const conv of resolvedRows ?? []) {
    console.log('conv', conv?.id);
    const result = await enqueueAutomationJob({
      organizationId,
      jobType: 'lifecycle.auto_close_resolved',
      payload: {
        conversationId: conv.id,
        resolvedAutoCloseDays: lifecycle.resolved_auto_close_days,
        idleCutoff: resolvedCutoff,
      },
      idempotencyKey: lifecycleAutoCloseResolvedIdempotencyKey(organizationId, conv.id),
      maxAttempts: 5,
    });
    console.log('result', result);
    if (result.jobId && !result.skipped) enqueuedResolved += 1;
  }

  let enqueuedReminders = 0;
  let reminderCandidates = 0;
  if (lifecycle.customer_reminder_enabled) {
    const { data: reminderRows, error: reminderErr } = await supabaseAdmin
      .from('conversations')
      .select(
        'id, status, last_customer_message_at, last_agent_message_at, last_message_at, created_at, customer_reminder_sent_at, waiting_status',
      )
      .eq('organization_id', organizationId)
      .eq('waiting_status', 'waiting_customer')
      .eq('is_spam', false)
      .is('customer_reminder_sent_at', null)
      .order('last_message_at', { ascending: true })
      .limit(LIFECYCLE_WAITING_BATCH_LIMIT);

    if (reminderErr) {
      throw new Error(reminderErr.message || 'lifecycle waiting reminder scan failed');
    }

    console.log('reminderRows', reminderRows);
    for (const conv of reminderRows ?? []) {
        console.log('conv', conv?.id);
      if (!isWaitingReminderCandidate(conv, reminderCutoff)) continue;
      console.log('isWaitingReminderCandidate', isWaitingReminderCandidate(conv, reminderCutoff));
      reminderCandidates += 1;
      console.log('enqueueing reminder for conversation', conv.id);
      const result = await enqueueAutomationJob({
        organizationId,
        jobType: 'lifecycle.send_customer_reminder',
        payload: {
          conversationId: conv.id,
          reminderCutoff,
        },
        idempotencyKey: lifecycleCustomerReminderIdempotencyKey(organizationId, conv.id),
        maxAttempts: 5,
      });
      console.log('result', result);
      if (result.jobId && !result.skipped) enqueuedReminders += 1;
    }
  }

  const { data: waitingCloseRows, error: waitingCloseErr } = await supabaseAdmin
    .from('conversations')
    .select(
      'id, status, customer_reminder_sent_at, last_customer_message_at, waiting_status',
    )
    .eq('organization_id', organizationId)
    .eq('waiting_status', 'waiting_customer')
    .eq('is_spam', false)
    .not('customer_reminder_sent_at', 'is', null)
    .lt('customer_reminder_sent_at', waitingCloseCutoff)
    .order('customer_reminder_sent_at', { ascending: true })
    .limit(LIFECYCLE_WAITING_BATCH_LIMIT);

  if (waitingCloseErr) {
    throw new Error(waitingCloseErr.message || 'lifecycle waiting close scan failed');
  }

  let waitingCloseCandidates = 0;
  let enqueuedWaitingClose = 0;
  console.log('waitingCloseRows', waitingCloseRows);
  for (const conv of waitingCloseRows ?? []) {
    console.log('conv', conv?.id);
    console.log('isWaitingCloseAfterReminderCandidate', isWaitingCloseAfterReminderCandidate(conv, waitingCloseCutoff));
    if (!isWaitingCloseAfterReminderCandidate(conv, waitingCloseCutoff)) continue;
    waitingCloseCandidates += 1;
    const result = await enqueueAutomationJob({
      organizationId,
      jobType: 'lifecycle.auto_close_waiting',
      payload: {
        conversationId: conv.id,
        closeCutoff: waitingCloseCutoff,
      },
      idempotencyKey: lifecycleAutoCloseWaitingIdempotencyKey(organizationId, conv.id),
      maxAttempts: 5,
    });
    console.log('result auto close waiting', result);
    if (result.jobId && !result.skipped) enqueuedWaitingClose += 1;
  }

  logLifecycleStructured('info', {
    organization_id: organizationId,
    op: 'lifecycle.scan_org',
    outcome: 'completed',
    resolved_candidates: resolvedRows?.length ?? 0,
    enqueued_auto_close_resolved: enqueuedResolved,
    reminder_candidates: reminderCandidates,
    enqueued_reminders: enqueuedReminders,
    waiting_close_candidates: waitingCloseCandidates,
    enqueued_auto_close_waiting: enqueuedWaitingClose,
    resolved_auto_close_days: lifecycle.resolved_auto_close_days,
    waiting_reminder_days: lifecycle.waiting_reminder_days,
    waiting_auto_close_after_reminder_days: lifecycle.waiting_auto_close_after_reminder_days,
    duration_ms: Date.now() - startedAt,
  });
}

/**
 * Enqueue lifecycle scan for every org (cron).
 *
 * @param {string} scanBucketKey — 15-minute UTC bucket (same cadence as SLA scan)
 */
export async function enqueueLifecycleScansForAllOrgs(scanBucketKey) {
  const { data: orgs, error } = await supabaseAdmin.from('organizations').select('id');
  if (error) throw new Error(error.message);

  for (const org of orgs ?? []) {
    console.log('enqueueing lifecycle scan for organization', org.id);
    await enqueueAutomationJob({
      organizationId: org.id,
      jobType: 'lifecycle.scan_org',
      payload: { scanBucketKey },
      idempotencyKey: lifecycleScanOrgIdempotencyKey(org.id, scanBucketKey),
    });
  }
}
