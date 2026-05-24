import { parseAutomationJobPayload } from '../jobPayload.js';
import { runSlaWarningWorkflowAutomation } from '../../ai/workflowRules.service.js';
import { getOrgAssignmentSettings } from '../../assignment/assignmentSettings.service.js';
import { scheduleReassign } from '../enqueueReassign.service.js';

/**
 * Apply workflow rules for `sla_warning` trigger (enqueued from SLA scan).
 *
 * @param {object} job
 */
export async function handleWorkflowSla(job) {
  const p = parseAutomationJobPayload(job);
  const conversationId =
    typeof p.conversationId === 'string'
      ? p.conversationId.trim()
      : typeof p.conversation_id === 'string'
        ? p.conversation_id.trim()
        : '';

  if (!conversationId) {
    throw new Error('ai.workflow_sla payload requires conversationId');
  }

  const slaMinutes = Number(p.slaMinutes ?? p.sla_minutes);

  await runSlaWarningWorkflowAutomation({
    organizationId: job.organization_id,
    conversationId,
    slaMinutes: Number.isFinite(slaMinutes) ? slaMinutes : undefined,
  });

  const routing = await getOrgAssignmentSettings(job.organization_id);
  if (routing.reassign_enabled && routing.reassign_on_sla_warning) {
    const day = new Date().toISOString().slice(0, 10);
    scheduleReassign({
      organizationId: job.organization_id,
      conversationId,
      trigger: 'sla_warning',
      triggerKey: `sla_warning:${day}`,
    });
  }
}
