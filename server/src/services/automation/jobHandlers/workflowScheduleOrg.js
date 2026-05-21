import { CONVERSATION_ACTIVE_STATUSES, workflowScheduleScanIdempotencyKey } from '@ai-support/shared';
import { supabaseAdmin } from '../../../config/supabase.js';
import { enqueueAutomationJob } from '../enqueueJob.service.js';
import { getOrgWorkflowRules, runScheduleWorkflowForConversation } from '../../ai/workflowRules.service.js';
import { isWithinBusinessHours } from '../../ai/businessHours.service.js';
import { isWorkflowAutomationEnabled } from '../../ai/workflowAiGates.service.js';
import { logWorkflowEvent } from '../../ai/workflowLog.service.js';

const MAX_CONVERSATIONS_PER_SCAN = 80;

/**
 * Evaluate `schedule` workflow rules for active conversations in this org.
 *
 * @param {object} job
 */
export async function handleWorkflowScheduleOrg(job) {
  const organizationId = job.organization_id;
  if (!(await isWorkflowAutomationEnabled(organizationId))) return;

  const { rules, schedule } = await getOrgWorkflowRules(organizationId);
  const scheduleRules = (rules ?? []).filter(
    (r) => r.enabled !== false && r.trigger === 'schedule',
  );
  if (!schedule.enabled || scheduleRules.length === 0) {
    return;
  }

  const inBusinessHours = isWithinBusinessHours(schedule);

  const { data: conversations, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('organization_id', organizationId)
    .in('status', [...CONVERSATION_ACTIVE_STATUSES])
    .eq('is_spam', false)
    .is('assigned_to_member_id', null)
    .order('last_message_at', { ascending: false })
    .limit(MAX_CONVERSATIONS_PER_SCAN);

  if (error) {
    throw new Error(error.message || 'Schedule workflow scan failed');
  }

  let processed = 0;
  for (const conv of conversations ?? []) {
    try {
      await runScheduleWorkflowForConversation({
        organizationId,
        conversationId: conv.id,
        isBusinessHours: inBusinessHours,
      });
      processed += 1;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[workflow] schedule conv failed', {
        organization_id: organizationId,
        conversation_id: conv.id,
        error: e?.message,
      });
    }
  }

  logWorkflowEvent({
    organization_id: organizationId,
    event: 'schedule_scan_complete',
    processed,
    in_business_hours: inBusinessHours,
  });
}

/** Enqueue schedule workflow scan per org (cron). */
export async function enqueueWorkflowScheduleScansForAllOrgs() {
  const { data: orgs, error } = await supabaseAdmin.from('organizations').select('id, settings');
  if (error) throw new Error(error.message);

  const hourKey = new Date().toISOString().slice(0, 13);

  for (const org of orgs ?? []) {
    if (!(await isWorkflowAutomationEnabled(org.id))) continue;

    const settings = org.settings && typeof org.settings === 'object' ? org.settings : {};
    const workflow = settings.workflow && typeof settings.workflow === 'object' ? settings.workflow : {};
    const schedule = workflow.schedule && typeof workflow.schedule === 'object' ? workflow.schedule : {};
    if (!schedule.enabled) continue;

    const rules = Array.isArray(workflow.rules) ? workflow.rules : [];
    const hasScheduleRules = rules.some((r) => r?.trigger === 'schedule' && r?.enabled !== false);
    if (!hasScheduleRules) continue;

    await enqueueAutomationJob({
      organizationId: org.id,
      jobType: 'ai.workflow_schedule_org',
      payload: {},
      idempotencyKey: workflowScheduleScanIdempotencyKey(org.id, hourKey),
    });
  }
}
