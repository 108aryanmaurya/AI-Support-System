import { workflowInboundIdempotencyKey } from '@ai-support/shared';
import { emitAutomationJob } from './enqueueJob.service.js';
import { isWorkflowAutomationEnabled } from '../ai/workflowAiGates.service.js';

/**
 * Fire-and-forget: queue Phase 4 inbound workflow evaluation + action apply.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.messageId
 * @param {number} [params.runAtDelayMs] — defer (e.g. fallback after classification path)
 */
export function scheduleInboundWorkflow({
  organizationId,
  conversationId,
  messageId,
  runAtDelayMs = 0,
}) {
  void (async () => {
    try {
      if (!(await isWorkflowAutomationEnabled(organizationId))) return;

      const runAt =
        runAtDelayMs > 0 ? new Date(Date.now() + runAtDelayMs).toISOString() : null;

      emitAutomationJob({
        organizationId,
        jobType: 'ai.workflow_inbound',
        payload: { conversationId, messageId },
        idempotencyKey: workflowInboundIdempotencyKey(organizationId, messageId),
        maxAttempts: 5,
        runAt,
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
