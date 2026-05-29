import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import { sendNotificationEmailIfConfigured } from './internalNotificationMail.service.js';
import {
  emailForMember,
  resolveOrgAdminNotificationEmail,
} from './customerInboundNotification.service.js';
import { getOrgAssignmentSettings } from './assignment/assignmentSettings.service.js';

/**
 * @typedef {'first_response' | 'next_response'} SlaBreachType
 * @typedef {'scan' | 'workflow'} SlaNotifySource
 */

function formatUtcWhen(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return (
    new Date(t).toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    }) + ' (UTC)'
  );
}

/**
 * Dedicated scan path: assignee when assigned; else assignment fallback list or org admin.
 *
 * @param {string} organizationId
 * @param {string | null} assignedToMemberId
 * @returns {Promise<string[]>}
 */
export async function resolveSlaBreachRecipientEmails(organizationId, assignedToMemberId) {
  const emails = new Set();

  if (assignedToMemberId) {
    const assignee = await emailForMember(organizationId, assignedToMemberId);
    if (assignee) emails.add(assignee);
    return [...emails];
  }

  const routing = await getOrgAssignmentSettings(organizationId);
  for (const memberId of routing.fallback_notify_member_ids ?? []) {
    const e = await emailForMember(organizationId, memberId);
    if (e) emails.add(e);
  }

  if (emails.size === 0) {
    const admin = await resolveOrgAdminNotificationEmail(organizationId);
    if (admin) emails.add(admin);
  }

  return [...emails];
}

/**
 * Legacy workflow `notify` channel routing (single recipient).
 */
async function resolveWorkflowChannelRecipient(organizationId, conv, channel) {
  if (channel === 'assignee' && conv.assigned_to_member_id) {
    const email = await emailForMember(organizationId, conv.assigned_to_member_id);
    return email ? [{ email, role: 'assignee' }] : [];
  }
  if (channel === 'staff') {
    const email = await resolveOrgAdminNotificationEmail(organizationId);
    return email ? [{ email, role: 'organization admin' }] : [];
  }
  if (channel === 'assignee' && !conv.assigned_to_member_id) {
    return [];
  }
  return [];
}

async function loadConversationContext(organizationId, conversationId) {
  const { data: conv, error: cErr } = await supabaseAdmin
    .from('conversations')
    .select(
      'id, source, status, subject, assigned_to_member_id, channel_type, last_customer_message_at',
    )
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (cErr || !conv) return null;

  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('sender_type, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  const list = messages ?? [];
  const firstCustomer = list.find((m) => m.sender_type === 'customer');
  const lastCustomer = [...list].reverse().find((m) => m.sender_type === 'customer');

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

  return { conv, firstCustomer, lastCustomer, customerEmail, list };
}

function buildSlaBreachEmail({
  breachType,
  slaLabel,
  conv,
  customerEmail,
  firstCustomer,
  lastCustomer,
  recipientRole,
  organizationId,
}) {
  const shortId = typeof conv.id === 'string' ? `${conv.id.slice(0, 8)}…` : '—';
  const subjectLine =
    typeof conv.subject === 'string' && conv.subject.trim() ? conv.subject.trim() : null;
  const inboxUrl = `${env.publicAppUrl}/org/${organizationId}/inbox`;
  const when = formatUtcWhen(new Date().toISOString());

  const isNext = breachType === 'next_response';
  const headline = isNext
    ? `Next-response SLA breached (${slaLabel}).`
    : `First-response SLA breached (${slaLabel}).`;
  const explanation = isNext
    ? 'The customer is waiting for an agent reply (waiting_agent) and the reply deadline has passed.'
    : 'No agent reply has been sent since the customer’s first message.';

  const anchorMsg = isNext ? lastCustomer : firstCustomer;
  const snippet =
    typeof anchorMsg?.content === 'string' && anchorMsg.content.trim()
      ? anchorMsg.content.trim().slice(0, 500)
      : '(no message text)';
  const anchorLabel = isNext ? 'Latest customer message' : 'First customer message';
  const anchorAt = formatUtcWhen(anchorMsg?.created_at ?? conv.last_customer_message_at);

  const subject = isNext
    ? `SLA breach — next response overdue (${shortId})`
    : `SLA breach — first response overdue (${shortId})`;

  const lines = [
    headline,
    '',
    explanation,
    '',
    `Notifying: ${recipientRole}`,
    '',
    anchorLabel,
    snippet,
    '',
    'Details',
    `  Customer email: ${customerEmail}`,
    `  Conversation ID: ${conv.id}`,
    `  Short ID: ${shortId}`,
    `  Channel: ${conv.channel_type ?? conv.source ?? '—'}`,
    `  Status: ${conv.status ?? '—'}`,
    ...(subjectLine ? [`  Subject: ${subjectLine}`] : []),
    `  Assignee: ${conv.assigned_to_member_id ? 'assigned' : 'unassigned'}`,
    `  ${anchorLabel} (UTC): ${anchorAt}`,
    `  Alert sent (UTC): ${when}`,
    '',
    `Open inbox: ${inboxUrl}`,
    '',
    '— AI Support',
  ];

  return { subject, text: lines.join('\n') };
}

/**
 * Email staff about an SLA breach.
 * - `source: 'scan'` — dedicated routing (assignee or fallback/admin); may email multiple recipients.
 * - `source: 'workflow'` — legacy single-recipient `staff` / `assignee` channel.
 *
 * @param {object} p
 * @param {string} p.organizationId
 * @param {string} p.conversationId
 * @param {number} [p.slaMinutes]
 * @param {SlaBreachType} [p.breachType]
 * @param {SlaNotifySource} [p.source]
 * @param {'staff' | 'assignee'} [p.channel]
 */
export async function notifyStaffOfSlaWarning({
  organizationId,
  conversationId,
  slaMinutes,
  breachType = 'first_response',
  source = 'scan',
  channel = 'staff',
}) {
  try {
    const ctx = await loadConversationContext(organizationId, conversationId);
    if (!ctx) {
      // eslint-disable-next-line no-console
      console.error('[sla-warning-notify] conversation not found');
      return;
    }

    const { conv, firstCustomer, lastCustomer, customerEmail } = ctx;
    const slaLabel =
      Number.isFinite(slaMinutes) && slaMinutes > 0 ? `${slaMinutes} minutes` : 'configured SLA';
    const resolvedBreachType =
      breachType === 'next_response' ? 'next_response' : 'first_response';

    let targets = [];

    if (source === 'scan') {
      const emails = await resolveSlaBreachRecipientEmails(
        organizationId,
        conv.assigned_to_member_id ?? null,
      );
      const roleLabel = conv.assigned_to_member_id
        ? 'assigned agent'
        : 'routing fallback / organization admin';
      targets = emails.map((email) => ({ email, role: roleLabel }));
    } else {
      targets = await resolveWorkflowChannelRecipient(organizationId, conv, channel);
    }

    if (targets.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[sla-warning-notify] no recipient emails; skip send', {
        organization_id: organizationId,
        conversation_id: conversationId,
        source,
        channel,
      });
      return;
    }

    for (const { email, role } of targets) {
      const { subject, text } = buildSlaBreachEmail({
        breachType: resolvedBreachType,
        slaLabel,
        conv,
        customerEmail,
        firstCustomer,
        lastCustomer,
        recipientRole: role,
        organizationId,
      });

      const result = await sendNotificationEmailIfConfigured({ to: email, subject, text });
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error('[sla-warning-notify] send failed', { to: email, error: result.error });
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[sla-warning-notify]', e);
  }
}
