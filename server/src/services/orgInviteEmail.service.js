import { supabaseAdmin } from '../config/supabase.js';
import { sendNotificationEmailIfConfigured } from './internalNotificationMail.service.js';

function formatInviteRole(role) {
  const r = String(role ?? '').trim().toUpperCase();
  if (r === 'ADMIN') return 'Admin';
  if (r === 'AGENT') return 'Agent';
  return r || 'Member';
}

function formatExpiry(expiresAtIso) {
  const t = Date.parse(expiresAtIso);
  if (!Number.isFinite(t)) return 'soon';
  return new Date(t).toLocaleString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' (UTC)';
}

async function loadOrganizationName(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .limit(1)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[invite-email] could not load org name', {
      organization_id: organizationId,
      message: error.message,
    });
    return 'your workspace';
  }
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  return name || 'your workspace';
}

/**
 * Sends teammate invite email via NOTIFICATION_RESEND_API_KEY / NOTIFICATION_EMAIL_FROM.
 * Does not throw; invite creation should succeed even when email fails.
 *
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string | null }>}
 */
export async function sendTeammateInviteEmail({
  organizationId,
  organizationName,
  toEmail,
  inviteLink,
  role,
  expiresAtIso,
  inviterDisplayName,
}) {
  const to = typeof toEmail === 'string' ? toEmail.trim().toLowerCase() : '';
  const link = typeof inviteLink === 'string' ? inviteLink.trim() : '';
  if (!to || !link) {
    return { ok: false, error: 'to and inviteLink are required.' };
  }

  const orgName =
    typeof organizationName === 'string' && organizationName.trim()
      ? organizationName.trim()
      : await loadOrganizationName(organizationId);

  const roleLabel = formatInviteRole(role);
  const expiryLabel = formatExpiry(expiresAtIso);
  const inviterLine =
    typeof inviterDisplayName === 'string' && inviterDisplayName.trim()
      ? `${inviterDisplayName.trim()} invited you to join ${orgName} as ${roleLabel}.`
      : `You've been invited to join ${orgName} as ${roleLabel}.`;

  const lines = [
    'Hello,',
    '',
    inviterLine,
    '',
    'Accept your invitation:',
    link,
    '',
    `This link expires on ${expiryLabel}.`,
    '',
    '— AI Support',
  ];

  const subject = `You're invited to join ${orgName}`;
  const result = await sendNotificationEmailIfConfigured({
    to,
    subject,
    text: lines.join('\n'),
  });

  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error('[invite-email] send failed', {
      organization_id: organizationId,
      to,
      error: result.error,
    });
  }

  return result;
}
