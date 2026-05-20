import { workflowInboundIdempotencyKey } from '@ai-support/shared';
import { emitAutomationJob } from './enqueueJob.service.js';
import { isWorkflowAutomationEnabled } from '../ai/workflowAiGates.service.js';

/**
 * Fire-and-forget: queue Phase 4 inbound workflow evaluation (Sprint 1+ implements handler logic).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.messageId
 */
export function scheduleInboundWorkflow({ organizationId, conversationId, messageId }) {
  void (async () => {
    try {
      if (!(await isWorkflowAutomationEnabled(organizationId))) return;

      emitAutomationJob({
        organizationId,
        jobType: 'ai.workflow_inbound',
        payload: { conversationId, messageId },
        idempotencyKey: workflowInboundIdempotencyKey(organizationId, messageId),
        maxAttempts: 5,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[workflow] inbound enqueue skipped', {
        organization_id: organizationId,
        conversation_id: conversationId,
        message_id: messageId,
        error: e?.message,
      });
    }
  })();
}
