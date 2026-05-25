import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import { sendNotificationEmailIfConfigured } from './internalNotificationMail.service.js';

function displayNameFromUser(u) {
  const full = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return full || (typeof u?.email === 'string' ? u.email.split('@')[0] : '') || 'Teammate';
}

/**
 * After a successful assignment change, email the new assignee (not on self-assign or no-op).
 * Failures are logged only; does not throw.
 */
export async function notifyConversationAssignee({
  organizationId,
  conversation,
  assignedToMemberId,
  actorUserId,
  priorAssignedToMemberId,
}) {
  if (assignedToMemberId == null) return;
  if (assignedToMemberId === priorAssignedToMemberId) return;

 
  try {
    const { data: memberRow, error: memErr } = await supabaseAdmin
      .from('organization_members')
      .select('user_id')
      .eq('id', assignedToMemberId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (memErr || !memberRow?.user_id) {
      // eslint-disable-next-line no-console
      console.error('[assignment-notify] could not load assignee member', memErr?.message);
      return;
    }

    if (memberRow.user_id === actorUserId) return;

    const { data: assigneeUser } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('id', memberRow.user_id)
      .maybeSingle();

    const toEmail = typeof assigneeUser?.email === 'string' ? assigneeUser.email.trim() : '';
    if (!toEmail) {
      // eslint-disable-next-line no-console
      console.log('[assignment-notify] assignee has no email; skipping send');
      return;
    }

    const assigneeName = displayNameFromUser(assigneeUser);

    let assignerName = 'Intelligent routing';
    let assignmentIntro = `${assignerName} assigned this conversation to you.`;
    if (actorUserId) {
      const { data: actorUser } = await supabaseAdmin
        .from('users')
        .select('first_name, last_name, email')
        .eq('id', actorUserId)
        .maybeSingle();
      assignerName = displayNameFromUser(actorUser);
      assignmentIntro = `${assignerName} assigned this conversation to you.`;
    }
    const assignedAt = new Date().toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const assignedAtNote = `${assignedAt} (UTC)`;

    const conv = conversation ?? {};
    const convShort = typeof conv.id === 'string' ? conv.id.slice(0, 8) : '';
    const source = typeof conv.source === 'string' ? conv.source : 'chat';
    const status = typeof conv.status === 'string' ? conv.status : 'open';
    const subjectLine =
      typeof conv.subject === 'string' && conv.subject.trim()
        ? conv.subject.trim()
        : null;
    const inboxUrl = `${env.publicAppUrl}/org/${organizationId}/inbox`;

    const lines = [
      `Hello ${assigneeName},`,
      '',
      assignmentIntro,
      '',
      'Conversation',
      `  ID: ${conv.id ?? '—'}`,
      `  Short ID: ${convShort}…`,
      `  Source: ${source}`,
      `  Status: ${status}`,
    ];
    if (subjectLine) lines.push(`  Subject: ${subjectLine}`);
    lines.push(
      '',
      'Assignment',
      `  Assigned by: ${assignerName}`,
      `  Assigned to: ${assigneeName} (you)`,
      `  Time: ${assignedAtNote}`,
      '',
      `Open inbox: ${inboxUrl}`,
      '',
      '— AI Support',
    );

    const text = lines.join('\n');
    const subject = `Conversation assigned to you (${convShort}…)`;

    const result = await sendNotificationEmailIfConfigured({ to: toEmail, subject, text });
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('[assignment-notify] send failed', result.error);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[assignment-notify]', e);
  }
}
