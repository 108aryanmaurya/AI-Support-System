import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { getOrgAutomationSettings } from '../orgSettings.service.js';
import { resolveOrgAdminNotificationEmail } from '../customerInboundNotification.service.js';
import { sendNotificationEmailIfConfigured } from '../internalNotificationMail.service.js';
import { logWorkflowEvent } from './workflowLog.service.js';

async function emailForUser(userId) {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('email')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to resolve user email.');
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  return email || null;
}

/**
 * Send a one-off staff notification email to verify workflow `notify` delivery paths.
 * Does not mutate conversations or enqueue Phase 6 jobs.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.actorUserId
 */
export async function sendWorkflowTestNotification({ organizationId, actorUserId }) {
  const automation = await getOrgAutomationSettings(organizationId);
  if (!automation.inbound_notify_enabled) {
    throw new HttpError(
      400,
      'Inbound staff email notifications are disabled. Enable “Email on new customer message” under Automation settings first.',
    );
  }

  const to =
    (await emailForUser(actorUserId)) ?? (await resolveOrgAdminNotificationEmail(organizationId));
  if (!to) {
    throw new HttpError(400, 'No notification email found for this workspace.');
  }

  const result = await sendNotificationEmailIfConfigured({
    to,
    subject: '[Workflow test] Staff notification',
    text: [
      'This is a test message from Workflow automation settings.',
      '',
      'If you received this email, staff notify delivery is configured for this workspace.',
      'Workflow rules that use the notify action enqueue the same delivery path.',
      '',
      `Organization: ${organizationId}`,
      `Sent at: ${new Date().toISOString()}`,
    ].join('\n'),
  });

  logWorkflowEvent({
    organization_id: organizationId,
    event: 'test_notification',
    to_domain: to.split('@')[1] ?? 'unknown',
    ok: result.ok,
    skipped: Boolean(result.skipped),
  });

  if (!result.ok) {
    throw new HttpError(502, result.error || 'Failed to send test notification.');
  }

  return {
    ok: true,
    skipped: Boolean(result.skipped),
    message: result.skipped
      ? 'Email provider not configured; check server logs for mock output.'
      : 'Test notification sent.',
  };
}
