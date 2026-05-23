import { parseAutomationJobPayload } from '../jobPayload.js';
import { runSlaWarningWorkflowAutomation } from '../../ai/workflowRules.service.js';

/**
 * Apply workflow rules for `sla_warning` trigger (enqueued from SLA scan).
 *
 * @param {object} job
 */
export async function handleWorkflowSla(job) {
  const p = parseAutomationJobPayload(job);
  console.log('handleWorkflowSla', p)
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
}
