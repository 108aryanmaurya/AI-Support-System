import { notifyStaffOfSlaWarning } from '../../slaWarningNotification.service.js';

/**
 * @param {object} job
 */
export async function handleNotifySlaWarning(job) {
  const p = job.payload ?? {};
  const breachType = p.breachType === 'next_response' ? 'next_response' : 'first_response';
  const source = p.source === 'workflow' ? 'workflow' : 'scan';

  await notifyStaffOfSlaWarning({
    organizationId: job.organization_id,
    conversationId: p.conversationId,
    slaMinutes: p.slaMinutes,
    breachType,
    source,
    channel: p.channel === 'assignee' ? 'assignee' : 'staff',
  });
}
