import { scheduleInboundClassification } from './enqueueClassifyInbound.service.js';

/**
 * Post-customer-message automation entry (Phase 3 classification + Phase 4 workflow).
 * Called from web ingress and email webhook after the message row exists.
 *
 * - When classification can run: `ai.classify_inbound` runs first, then enqueues `ai.workflow_inbound`.
 * - When classification is skipped: enqueues `ai.workflow_inbound` immediately.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.messageId
 */
export function scheduleInboundPostCustomerMessage({ organizationId, conversationId, messageId }) {
  scheduleInboundClassification({ organizationId, conversationId, messageId });
}
