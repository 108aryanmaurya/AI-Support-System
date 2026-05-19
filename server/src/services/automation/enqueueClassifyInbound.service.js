import { emitAutomationJob } from './enqueueJob.service.js';
import { canEnqueueInboundClassification } from '../ai/classification.service.js';

/**
 * Fire-and-forget: queue async LLM classification after a customer message is stored.
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
      if (!allowed) return;

      emitAutomationJob({
        organizationId,
        jobType: 'ai.classify_inbound',
        payload: { conversationId, messageId },
        idempotencyKey: `classify:${organizationId}:${messageId}`,
        maxAttempts: 4,
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
