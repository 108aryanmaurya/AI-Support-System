import { notifyStaffOfSlaWarning } from '../../slaWarningNotification.service.js';

/**
 * @param {object} job
 */
export async function handleNotifySlaWarning(job) {
  const p = job.payload ?? {};
  await notifyStaffOfSlaWarning({
    organizationId: job.organization_id,
    conversationId: p.conversationId,
    slaMinutes: p.slaMinutes,
    channel: p.channel === 'assignee' ? 'assignee' : 'staff',
  });
}
