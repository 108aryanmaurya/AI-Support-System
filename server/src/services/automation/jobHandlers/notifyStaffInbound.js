import { notifyStaffOfCustomerMessage } from '../../customerInboundNotification.service.js';

/**
 * @param {object} job
 * @param {object} job.payload
 */
export async function handleNotifyStaffInbound(job) {
  const p = job.payload ?? {};
  await notifyStaffOfCustomerMessage({
    organizationId: job.organization_id,
    conversationId: p.conversationId,
    customerMessage: p.customerMessage ?? '',
    customerEmail: p.customerEmail ?? '',
    channelLabel: p.channelLabel ?? 'chat',
  });
}
