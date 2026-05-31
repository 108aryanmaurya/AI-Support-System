import {
  CONVERSATION_ACTIVE_STATUSES,
  unassignedScanOrgIdempotencyKey,
  utcCalendarDayKey,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../../config/supabase.js';
import { getOrgAiAndAutomationSettings } from '../../orgSettings.service.js';
import { logAssignmentStructured } from '../../assignment/assignmentStructuredLog.service.js';
import { tryScheduleAutoRouteDailyBackstop } from '../enqueueAutoRoute.service.js';
import { enqueueAutomationJob } from '../enqueueJob.service.js';

/** Max unassigned threads per org per daily scan (bounded work per cron). */
export const UNASSIGNED_DAILY_SCAN_BATCH_LIMIT = 100;

/**
 * Find active unassigned conversations and enqueue daily backstop auto-route jobs.
 */
export async function handleUnassignedScanOrg(job) {
  const organizationId = job.organization_id;
  const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
  const dayKey =
    typeof payload.dayKey === 'string' && payload.dayKey.trim()
      ? payload.dayKey.trim()
      : utcCalendarDayKey();

  const { ai } = await getOrgAiAndAutomationSettings(organizationId);
  if (!ai.ai_enabled) {
    logAssignmentStructured('info', {
      organization_id: organizationId,
      op: 'scan_unassigned_org',
      outcome: 'skipped',
      reason: 'ai_disabled',
      day_key: dayKey,
    });
    return;
  }

  const startedAt = Date.now();

  const { data: rows, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('organization_id', organizationId)
    .in('status', [...CONVERSATION_ACTIVE_STATUSES])
    .eq('is_spam', false)
    .or('assignment_type.eq.unassigned,assignment_type.is.null')
    .is('assigned_to_member_id', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(UNASSIGNED_DAILY_SCAN_BATCH_LIMIT);

  if (error) {
    throw new Error(error.message || 'Unassigned scan failed');
  }

  let candidates = 0;
  let enqueued = 0;
  let skippedNoMessage = 0;

  for (const row of rows ?? []) {
    candidates += 1;

    const { data: latestCustomer, error: msgErr } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('conversation_id', row.id)
      .eq('organization_id', organizationId)
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (msgErr || !latestCustomer?.id) {
      skippedNoMessage += 1;
      continue;
    }

    const result = await tryScheduleAutoRouteDailyBackstop({
      organizationId,
      conversationId: row.id,
      messageId: latestCustomer.id,
      dayKey,
    });

    if (result.scheduled) enqueued += 1;
  }

  logAssignmentStructured('info', {
    organization_id: organizationId,
    op: 'scan_unassigned_org',
    outcome: 'completed',
    day_key: dayKey,
    candidates,
    enqueued,
    skipped_no_customer_message: skippedNoMessage,
    duration_ms: Date.now() - startedAt,
  });
}

/**
 * Enqueue daily unassigned scan for every organization (cron).
 *
 * @param {string} [dayKey] — UTC calendar day `YYYY-MM-DD`
 */
export async function enqueueUnassignedScansForAllOrgs(dayKey = utcCalendarDayKey()) {
  const { data: orgs, error } = await supabaseAdmin.from('organizations').select('id');
  if (error) throw new Error(error.message);

  for (const org of orgs ?? []) {
    await enqueueAutomationJob({
      organizationId: org.id,
      jobType: 'assignment.scan_unassigned_org',
      payload: { dayKey },
      idempotencyKey: unassignedScanOrgIdempotencyKey(org.id, dayKey),
    });
  }
}
