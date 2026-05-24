import { parseAutomationJobPayload } from '../jobPayload.js';
import { runInboundWorkflowAutomation } from '../../ai/workflowRules.service.js';
import { scheduleAutoRoute } from '../enqueueAutoRoute.service.js';

/**
 * Evaluate and apply inbound_message workflow rules.
 *
 * @param {object} job
 */
export async function handleWorkflowInbound(job) {
  const p = parseAutomationJobPayload(job);
  const conversationId =
    typeof p.conversationId === 'string'
      ? p.conversationId.trim()
      : typeof p.conversation_id === 'string'
        ? p.conversation_id.trim()
        : '';
  const messageId =
    typeof p.messageId === 'string'
      ? p.messageId.trim()
      : typeof p.message_id === 'string'
        ? p.message_id.trim()
        : '';

  if (!conversationId || !messageId) {
    throw new Error('ai.workflow_inbound payload requires conversationId and messageId');
  }
  await runInboundWorkflowAutomation({
    organizationId: job.organization_id,
    conversationId,
    messageId,
  });

  scheduleAutoRoute({
    organizationId: job.organization_id,
    conversationId,
    messageId,
  });
}
