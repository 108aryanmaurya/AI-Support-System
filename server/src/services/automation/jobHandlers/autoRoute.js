import { parseAutomationJobPayload } from '../jobPayload.js';
import { runAutoAssignConversation } from '../../assignment/autoAssign.service.js';

/**
 * Intelligent assignment after inbound classify + workflow.
 *
 * @param {object} job
 */
export async function handleAutoRoute(job) {
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

  if (!conversationId) {
    throw new Error('assignment.auto_route payload requires conversationId');
  }

  await runAutoAssignConversation({
    organizationId: job.organization_id,
    conversationId,
    messageId: messageId || null,
  });
}
