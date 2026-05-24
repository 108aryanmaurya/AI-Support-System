import { parseAutomationJobPayload } from '../jobPayload.js';
import { runReassignConversation } from '../../assignment/reassign.service.js';

/**
 * Reassign conversation to a new agent (Sprint 6 `assignment.reassign`).
 *
 * @param {object} job
 */
export async function handleReassignConversation(job) {
  const p = parseAutomationJobPayload(job);
  const conversationId =
    typeof p.conversationId === 'string'
      ? p.conversationId.trim()
      : typeof p.conversation_id === 'string'
        ? p.conversation_id.trim()
        : '';

  if (!conversationId) {
    throw new Error('assignment.reassign payload requires conversationId');
  }

  const trigger = typeof p.trigger === 'string' ? p.trigger.trim() : 'system';
  const priorMemberId =
    typeof p.priorMemberId === 'string'
      ? p.priorMemberId.trim()
      : typeof p.prior_member_id === 'string'
        ? p.prior_member_id.trim()
        : null;

  await runReassignConversation({
    organizationId: job.organization_id,
    conversationId,
    trigger,
    priorMemberId,
  });
}
