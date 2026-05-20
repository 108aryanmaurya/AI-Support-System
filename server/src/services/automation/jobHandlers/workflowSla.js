import { parseAutomationJobPayload } from '../jobPayload.js';

/**
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

  // eslint-disable-next-line no-console
  console.info('[workflow] ai.workflow_sla stub (Sprint 4+)', {
    organization_id: job.organization_id,
    conversation_id: conversationId,
    job_id: job.id,
  });
}
