import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import { sendNotificationEmailIfConfigured } from './internalNotificationMail.service.js';

const FRESH_MESSAGE_MAX_AGE_MS = 20_000;

/**
 * Skip notification when `handle_incoming_message` returns an existing row (idempotent replay):
 * the message row is older than a few seconds.
 */
export async function isCustomerMessageFreshForNotification(messageId) {
  if (!messageId) return false;
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('created_at')
    .eq('id', messageId)
    .maybeSingle();

  if (error || !data?.created_at) return false;
  const age = Date.now() - new Date(data.created_at).getTime();
  return age >= 0 && age <= FRESH_MESSAGE_MAX_AGE_MS;
}

export async function emailForMember(organizationId, memberId) {
  const { data: member, error: mErr } = await supabaseAdmin
    .from('organization_members')
    .select('user_id')
    .eq('id', memberId)
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (mErr || !member?.user_id) return null;

  const { data: user, error: uErr } = await supabaseAdmin
    .from('users')
    .select('email')
    .eq('id', member.user_id)
    .maybeSingle();

  if (uErr || typeof user?.email !== 'string') return null;
  const email = user.email.trim().toLowerCase();
  return email || null;
}

/** Org creator email, else first ACTIVE ADMIN (by membership created_at). */
export async function resolveOrgAdminNotificationEmail(organizationId) {
  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('created_by')
    .eq('id', organizationId)
    .maybeSingle();

  if (!orgErr && org?.created_by) {
    const { data: creator } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', org.created_by)
      .maybeSingle();
    const e = typeof creator?.email === 'string' ? creator.email.trim().toLowerCase() : '';
    if (e) return e;
  }

  const { data: admins, error: aErr } = await supabaseAdmin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE')
    .eq('role', 'ADMIN')
    .order('created_at', { ascending: true })
    .limit(5);

  if (aErr || !admins?.length) return null;

  const ids = [...new Set(admins.map((r) => r.user_id).filter(Boolean))];
  const { data: users } = await supabaseAdmin.from('users').select('id, email').in('id', ids);

  for (const row of admins) {
    const u = users?.find((x) => x.id === row.user_id);
    const e = typeof u?.email === 'string' ? u.email.trim().toLowerCase() : '';
    if (e) return e;
  }
  return null;
}

/**
 * Email assignee when set; otherwise org admin fallback. Logs only on failure; does not throw.
 *
 * @param {object} p
 * @param {string} p.organizationId
 * @param {string} p.conversationId
 * @param {string} p.customerMessage
 * @param {string} p.customerEmail
 * @param {string} [p.channelLabel] — e.g. 'email', 'api'
 */
export async function notifyStaffOfCustomerMessage({
  organizationId,
  conversationId,
  customerMessage,
  customerEmail,
  channelLabel = 'chat',
}) {
  try {
    const { data: conv, error: cErr } = await supabaseAdmin
      .from('conversations')
      .select('id, source, status, subject, assigned_to_member_id')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (cErr || !conv) {
      // eslint-disable-next-line no-console
      console.error('[customer-inbound-notify] conversation not found', cErr?.message);
      return;
    }

    let recipientEmail = null;
    let recipientRole = 'staff';

    if (conv.assigned_to_member_id) {
      recipientEmail = await emailForMember(organizationId, conv.assigned_to_member_id);
      recipientRole = 'assignee';
    }
    if (!recipientEmail) {
      recipientEmail = await resolveOrgAdminNotificationEmail(organizationId);
      recipientRole = 'organization admin';
    }
    if (!recipientEmail) {
      // eslint-disable-next-line no-console
      console.log('[customer-inbound-notify] no assignee or admin email; skip send');
      return;
    }

    const shortId = typeof conv.id === 'string' ? `${conv.id.slice(0, 8)}…` : '—';
    const source = conv.source ?? '—';
    const subjectLine =
      typeof conv.subject === 'string' && conv.subject.trim() ? conv.subject.trim() : null;
    const inboxUrl = `${env.publicAppUrl}/org/${organizationId}/inbox`;
    const when = new Date().toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const msg =
      typeof customerMessage === 'string' && customerMessage.trim()
        ? customerMessage.trim()
        : '(empty message)';
    const cust =
      typeof customerEmail === 'string' && customerEmail.trim()
        ? customerEmail.trim().toLowerCase()
        : '—';

    const lines = [
      `A customer sent a new message (${channelLabel} channel).`,
      '',
      `Notifying: ${recipientRole}`,
      '',
      'Message from customer',
      msg,
      '',
      'Details',
      `  Customer email: ${cust}`,
      `  Conversation ID: ${conv.id}`,
      `  Short ID: ${shortId}`,
      `  Source: ${source}`,
      `  Status: ${conv.status ?? '—'}`,
      ...(subjectLine ? [`  Subject: ${subjectLine}`] : []),
      `  Assignee member ID: ${conv.assigned_to_member_id ?? '(unassigned — admin notified)'}`,
      `  Received (UTC): ${when}`,
      '',
      `Open inbox: ${inboxUrl}`,
      '',
      '— AI Support',
    ];

    const subject = `New customer message — ${shortId}`;
    const result = await sendNotificationEmailIfConfigured({
      to: recipientEmail,
      subject,
      text: lines.join('\n'),
    });
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('[customer-inbound-notify] send failed', result.error);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[customer-inbound-notify]', e);
  }
}
