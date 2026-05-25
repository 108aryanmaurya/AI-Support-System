import { parseAutomationJobPayload } from '../jobPayload.js';
import { runInboundWorkflowAutomation } from '../../ai/workflowRules.service.js';
import { tryScheduleAutoRoute } from '../enqueueAutoRoute.service.js';
import { schedulePostInboundNotification } from '../../postInboundNotification.service.js';

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

  const route = await tryScheduleAutoRoute({
    organizationId: job.organization_id,
    conversationId,
    messageId,
  });



  if (!route.scheduled) {
    const channelLabel =
      typeof p.channelLabel === 'string' && p.channelLabel.trim()
        ? p.channelLabel.trim()
        : 'chat';
    const customerMessage =
      typeof p.customerMessage === 'string' ? p.customerMessage : undefined;
    const customerEmail =
      typeof p.customerEmail === 'string' ? p.customerEmail : undefined;

    const mode =
      route.reason === 'already_assigned' ? 'standard' : 'routing_fallback';
    const autoRouteReason =
      route.reason === 'already_assigned' ? null : route.reason ?? 'auto_route_not_scheduled';

    await schedulePostInboundNotification({
      organizationId: job.organization_id,
      conversationId,
      messageId,
      customerMessage,
      customerEmail,
      channelLabel,
      mode,
      autoRouteReason,
      idempotencyKey: `post-inbound:${job.organization_id}:${messageId}:${mode}`,
    });
  }
}
