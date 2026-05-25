import { deliverPostInboundNotification } from '../../postInboundNotification.service.js';

/**
 * @param {object} job
 * @param {object} job.payload
 */
export async function handleNotifyStaffInbound(job) {
  const p = job.payload ?? {};
  await deliverPostInboundNotification({
    organizationId: job.organization_id,
    conversationId: p.conversationId,
    customerMessage: p.customerMessage ?? '',
    customerEmail: p.customerEmail ?? '',
    channelLabel: p.channelLabel ?? 'chat',
    mode: p.mode ?? 'standard',
    autoRouteReason: p.autoRouteReason ?? null,
    primaryCodes: Array.isArray(p.primaryCodes) ? p.primaryCodes : [],
    assignedToMemberId: p.assignedToMemberId ?? null,
  });
}
