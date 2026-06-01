import { mergeTeammateProfile, TEAMMATE_BIO_MAX_LENGTH } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { getOrganizationMemberById } from './org.service.js';

/**
 * @param {string} organizationId
 * @param {string} memberId
 */
export async function getTeammateProfileBundle(organizationId, memberId) {
  const member = await getOrganizationMemberById(organizationId, memberId);

  const { data: userRow, error: uErr } = await supabaseAdmin
    .from('users')
    .select('id, email, first_name, last_name, job_title, created_at, profile')
    .eq('id', member.userId)
    .maybeSingle();

  if (uErr) {
    throw new HttpError(500, uErr.message || 'Failed to load user profile.');
  }
  if (!userRow) {
    throw new HttpError(404, 'User profile not found.');
  }

  const { data: orgRow } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .maybeSingle();

  const { data: presence } = await supabaseAdmin
    .from('agent_presence')
    .select('presence, last_seen')
    .eq('organization_id', organizationId)
    .eq('member_id', memberId)
    .maybeSingle();

  const { data: inboxRows } = await supabaseAdmin
    .from('inbox_members')
    .select('inbox_id, inboxes(id, name, status)')
    .eq('organization_member_id', memberId);

  const inboxes = (inboxRows ?? [])
    .map((row) => {
      const inbox = Array.isArray(row.inboxes) ? row.inboxes[0] : row.inboxes;
      if (!inbox?.id || inbox.status !== 'active') return null;
      return { id: inbox.id, name: inbox.name ?? 'Team inbox' };
    })
    .filter(Boolean);

  const { data: conversations } = await supabaseAdmin
    .from('conversations')
    .select('id, channel_type, status, priority, metadata, subject, updated_at, created_at')
    .eq('organization_id', organizationId)
    .eq('assigned_to_member_id', memberId)
    .order('updated_at', { ascending: false })
    .limit(12);

  const convIds = (conversations ?? []).map((c) => c.id);
  /** @type {Map<string, { body: string, created_at: string }>} */
  const lastMessageByConv = new Map();

  if (convIds.length > 0) {
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('conversation_id, body, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(200);

    for (const msg of messages ?? []) {
      if (!msg?.conversation_id || lastMessageByConv.has(msg.conversation_id)) continue;
      lastMessageByConv.set(msg.conversation_id, {
        body: typeof msg.body === 'string' ? msg.body : '',
        created_at: msg.created_at,
      });
    }
  }

  const profile = mergeTeammateProfile(userRow.profile);

  return {
    member: {
      ...member,
      firstName: userRow.first_name ?? member.firstName,
      lastName: userRow.last_name ?? member.lastName,
      jobTitle: userRow.job_title ?? null,
      userCreatedAt: userRow.created_at,
    },
    organizationName: orgRow?.name ?? 'Workspace',
    profile,
    presence: {
      status: presence?.presence ?? 'offline',
      lastSeen: presence?.last_seen ?? null,
    },
    inboxes,
    conversations: (conversations ?? []).map((c) => ({
      id: c.id,
      channelType: c.channel_type,
      status: c.status,
      priority: c.priority,
      subject: c.subject,
      metadata: c.metadata,
      updatedAt: c.updated_at,
      createdAt: c.created_at,
      lastMessage: lastMessageByConv.get(c.id) ?? null,
    })),
  };
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 * @param {string} actorUserId
 * @param {boolean} actorIsSelf
 * @param {object} body
 */
export async function patchTeammateProfile(organizationId, memberId, _actorUserId, _actorIsSelf, body) {
  const member = await getOrganizationMemberById(organizationId, memberId);

  const userUpdates = {};
  if (typeof body.firstName === 'string') {
    userUpdates.first_name = body.firstName.trim().slice(0, 80) || null;
  }
  if (typeof body.lastName === 'string') {
    userUpdates.last_name = body.lastName.trim().slice(0, 80) || null;
  }
  if (typeof body.jobTitle === 'string') {
    userUpdates.job_title = body.jobTitle.trim().slice(0, 120) || null;
  }

  const profileInput =
    body?.profile && typeof body.profile === 'object' ? body.profile : null;
  if (profileInput) {
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('profile')
      .eq('id', member.userId)
      .maybeSingle();
    const prior = mergeTeammateProfile(existing?.profile);
    const profilePatch = mergeTeammateProfile({ ...prior, ...profileInput });
    if (profilePatch.bio.length > TEAMMATE_BIO_MAX_LENGTH) {
      throw new HttpError(400, `Bio must be at most ${TEAMMATE_BIO_MAX_LENGTH} characters.`);
    }
    userUpdates.profile = profilePatch;
  }

  if (Object.keys(userUpdates).length === 0) {
    throw new HttpError(400, 'No valid profile fields provided.');
  }

  const { error } = await supabaseAdmin.from('users').update(userUpdates).eq('id', member.userId);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to save profile.');
  }

  return getTeammateProfileBundle(organizationId, memberId);
}
