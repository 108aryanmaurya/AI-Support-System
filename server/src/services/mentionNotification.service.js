import { hasOrgPermission } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { getOrgAutomationSettings } from './orgSettings.service.js';
import { sendNotificationEmailIfConfigured } from './internalNotificationMail.service.js';

function displayNameFromUser(u) {
  const full = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return full || (typeof u?.email === 'string' ? u.email.split('@')[0] : '') || 'Teammate';
}

async function loadUserById(userId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, first_name, last_name')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * Email each newly mentioned agent (internal notes). Logs only on failure.
 *
 * @param {object} p
 * @param {string} p.organizationId
 * @param {string} p.conversationId
 * @param {string} p.messageId
 * @param {string} p.actorUserId
 * @param {string[]} p.mentionedUserIds — auth user ids
 * @param {string} p.noteSnippet
 */
export async function notifyMentionedAgents({
  organizationId,
  conversationId,
  messageId,
  actorUserId,
  mentionedUserIds,
  noteSnippet,
}) {
  const ids = [...new Set((mentionedUserIds ?? []).map(String).filter(Boolean))].filter(
    (id) => id !== String(actorUserId),
  );
  if (!ids.length) return;

  let automation;
  try {
    automation = await getOrgAutomationSettings(organizationId);
  } catch {
    return;
  }
  if (automation.mention_notify_enabled === false) return;

  const actor = await loadUserById(actorUserId);
  const actorName = displayNameFromUser(actor);
  const convShort =
    typeof conversationId === 'string' ? conversationId.slice(0, 8) : '';
  const inboxUrl = `${env.publicAppUrl}/org/${organizationId}/inbox?conversation=${encodeURIComponent(conversationId)}&filter=mentions`;
  const when = new Date().toLocaleString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const snippet =
    typeof noteSnippet === 'string' && noteSnippet.trim()
      ? noteSnippet.trim().slice(0, 500)
      : '(no preview)';

  for (const userId of ids) {
    try {
      const user = await loadUserById(userId);
      const toEmail = typeof user?.email === 'string' ? user.email.trim() : '';
      if (!toEmail) continue;

      const lines = [
        `Hello ${displayNameFromUser(user)},`,
        '',
        `${actorName} mentioned you on an internal note.`,
        '',
        `Conversation: ${convShort}…`,
        `Time (UTC): ${when} (UTC)`,
        '',
        'Note preview:',
        snippet,
        '',
        `Open conversation: ${inboxUrl}`,
        '',
        '— AI Support',
      ];

      const result = await sendNotificationEmailIfConfigured({
        to: toEmail,
        subject: `[Support] ${actorName} mentioned you on a conversation`,
        text: lines.join('\n'),
      });

      if (!result.ok && !result.skipped) {
        // eslint-disable-next-line no-console
        console.error('[mention-notify] send failed', {
          organization_id: organizationId,
          conversation_id: conversationId,
          message_id: messageId,
          mentioned_user_id: userId,
          error: result.error,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[mention-notify] recipient error', {
        organization_id: organizationId,
        mentioned_user_id: userId,
        error: e?.message ?? e,
      });
    }
  }
}

/**
 * @param {unknown} permissions
 */
export function assertCanPostInternalNote(permissions) {
  if (!hasOrgPermission(permissions, 'messages.internal_note')) {
    throw new HttpError(403, 'Internal notes are disabled for your role.');
  }
}
