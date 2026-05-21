import { parseAutomationJobPayload } from '../jobPayload.js';
import { runInboundClassification } from '../../ai/classification.service.js';
import { scheduleInboundWorkflow } from '../enqueueWorkflowInbound.service.js';

/**
 * @param {object} job
 */
export async function handleClassifyInbound(job) {
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
    throw new Error('ai.classify_inbound payload requires conversationId and messageId');
  }

  const result = await runInboundClassification({
    organizationId: job.organization_id,
    conversationId,
    messageId,
  });

  if (result.skipped) {
    // eslint-disable-next-line no-console
    console.info('[classification] job skipped', {
      organization_id: job.organization_id,
      conversation_id: conversationId,
      message_id: messageId,
      reason: result.reason,
    });
  }

  const skipWorkflow = result.skipped && result.reason === 'not_customer_message';
  if (!skipWorkflow) {
    scheduleInboundWorkflow({
      organizationId: job.organization_id,
      conversationId,
      messageId,
    });
  }
}
