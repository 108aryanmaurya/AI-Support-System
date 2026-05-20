import { parseAutomationJobPayload } from '../jobPayload.js';

/**
 * Phase 4 Sprint 1+ evaluates rules and mutates conversation state.
 * Sprint 0 registers the handler and validates payload shape.
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

  // eslint-disable-next-line no-console
  console.info('[workflow] ai.workflow_inbound stub (Sprint 1+)', {
    organization_id: job.organization_id,
    conversation_id: conversationId,
    message_id: messageId,
    job_id: job.id,
  });
}
