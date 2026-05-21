import { emitAutomationJob } from './enqueueJob.service.js';
import { canEnqueueInboundClassification } from '../ai/classification.service.js';
import { scheduleInboundWorkflow } from './enqueueWorkflowInbound.service.js';

/**
 * Fire-and-forget: queue async LLM classification after a customer message is stored.
 * When classification is not queued, schedules a delayed workflow job as fallback.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.messageId
 */
export function scheduleInboundClassification({ organizationId, conversationId, messageId }) {
  void (async () => {
    try {
      const allowed = await canEnqueueInboundClassification(organizationId, conversationId);
      if (allowed) {
        emitAutomationJob({
          organizationId,
          jobType: 'ai.classify_inbound',
          payload: { conversationId, messageId },
          idempotencyKey: `classify:${organizationId}:${messageId}`,
          maxAttempts: 4,
        });
        return;
      }

      scheduleInboundWorkflow({
        organizationId,
        conversationId,
        messageId,
        runAtDelayMs: 0,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[classification] enqueue skipped', {
        organization_id: organizationId,
        conversation_id: conversationId,
        message_id: messageId,
        error: e?.message,
      });
    }
  })();
}
