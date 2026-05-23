import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import { sendNotificationEmailIfConfigured } from './internalNotificationMail.service.js';
import {
  emailForMember,
  resolveOrgAdminNotificationEmail,
} from './customerInboundNotification.service.js';

/**
 * Email staff about a first-response SLA breach (workflow `sla_warning` + notify).
 * `staff` → org admin only (not assignee-first). `assignee` → current assignee when set.
 *
 * @param {object} p
 * @param {string} p.organizationId
 * @param {string} p.conversationId
 * @param {number} [p.slaMinutes]
 * @param {'staff' | 'assignee'} [p.channel]
 */
export async function notifyStaffOfSlaWarning({
  organizationId,
  conversationId,
  slaMinutes,
  channel = 'staff',
}) {
  try {
    const { data: conv, error: cErr } = await supabaseAdmin
      .from('conversations')
      .select('id, source, status, subject, assigned_to_member_id, channel_type')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (cErr || !conv) {
      // eslint-disable-next-line no-console
      console.error('[sla-warning-notify] conversation not found', cErr?.message);
      return;
    }

    let recipientEmail = null;
    let recipientRole = 'organization admin';

    if (channel === 'assignee' && conv.assigned_to_member_id) {
      recipientEmail = await emailForMember(organizationId, conv.assigned_to_member_id);
      recipientRole = 'assignee';
    } else if (channel === 'staff') {
      recipientEmail = await resolveOrgAdminNotificationEmail(organizationId);
      recipientRole = 'organization admin';
    } else if (channel === 'assignee' && !conv.assigned_to_member_id) {
      // eslint-disable-next-line no-console
      console.log('[sla-warning-notify] assignee channel but unassigned; skip');
      return;
    }

    if (!recipientEmail) {
      // eslint-disable-next-line no-console
      console.log('[sla-warning-notify] no recipient email; skip send');
      return;
    }

    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('sender_type, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });

    const firstCustomer = (messages ?? []).find((m) => m.sender_type === 'customer');
    const customerSnippet =
      typeof firstCustomer?.content === 'string' && firstCustomer.content.trim()
        ? firstCustomer.content.trim().slice(0, 500)
        : '(no message text)';

    let customerEmail = '—';
    const { data: convFull } = await supabaseAdmin
      .from('conversations')
      .select('customer_id')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (convFull?.customer_id) {
      const { data: customer } = await supabaseAdmin
        .from('customers')
        .select('email')
        .eq('id', convFull.customer_id)
        .maybeSingle();
      if (typeof customer?.email === 'string' && customer.email.trim()) {
        customerEmail = customer.email.trim().toLowerCase();
      }
    }

    const slaLabel =
      Number.isFinite(slaMinutes) && slaMinutes > 0 ? `${slaMinutes} minutes` : 'configured SLA';
    const shortId = typeof conv.id === 'string' ? `${conv.id.slice(0, 8)}…` : '—';
    const subjectLine =
      typeof conv.subject === 'string' && conv.subject.trim() ? conv.subject.trim() : null;
    const inboxUrl = `${env.publicAppUrl}/org/${organizationId}/inbox`;
    const when = new Date().toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const firstCustomerAt = firstCustomer?.created_at
      ? new Date(firstCustomer.created_at).toLocaleString('en-US', {
          timeZone: 'UTC',
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—';

    const lines = [
      `First-response SLA breached (${slaLabel}).`,
      '',
      'No agent reply has been sent since the customer’s first message.',
      '',
      `Notifying: ${recipientRole}`,
      '',
      'First customer message',
      customerSnippet,
      '',
      'Details',
      `  Customer email: ${customerEmail}`,
      `  Conversation ID: ${conv.id}`,
      `  Short ID: ${shortId}`,
      `  Channel: ${conv.channel_type ?? conv.source ?? '—'}`,
      `  Status: ${conv.status ?? '—'}`,
      ...(subjectLine ? [`  Subject: ${subjectLine}`] : []),
      `  Assignee member ID: ${conv.assigned_to_member_id ?? '(unassigned)'}`,
      `  First customer message (UTC): ${firstCustomerAt}`,
      `  Alert sent (UTC): ${when}`,
      '',
      `Open inbox: ${inboxUrl}`,
      '',
      '— AI Support',
    ];

    const subject = `SLA breach — first response overdue (${shortId})`;
    const result = await sendNotificationEmailIfConfigured({
      to: recipientEmail,
      subject,
      text: lines.join('\n'),
    });
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('[sla-warning-notify] send failed', result.error);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[sla-warning-notify]', e);
  }
}
