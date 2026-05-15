import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPagination(query) {
  const page = toInt(query.page, 1);
  const pageSize = Math.min(toInt(query.pageSize, 20), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}

export async function ensureOrgMembership(userId, organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('id, role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to validate organization membership.');
  }
  if (!data) {
    throw new HttpError(403, 'You are not a member of this organization.');
  }
  return data;
}

export async function findOrCreateCustomer({
  organizationId,
  email,
  name,
  phone,
  externalId,
  metadata = {},
}) {
  const normalizedEmail = email?.trim()?.toLowerCase() || null;

  if (normalizedEmail) {
    const { data: existing, error: findError } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (findError) throw new HttpError(500, findError.message || 'Failed to fetch customer.');
    if (existing) return { customer: existing, created: false };
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from('customers')
    .insert({
      organization_id: organizationId,
      email: normalizedEmail,
      name: name?.trim() || null,
      phone: phone?.trim() || null,
      external_id: externalId?.trim() || null,
      metadata,
    })
    .select('*')
    .single();

  if (createError) throw new HttpError(500, createError.message || 'Failed to create customer.');
  return { customer: created, created: true };
}

export async function createConversation({
  organizationId,
  customerId,
  assignedToMemberId,
  source,
  channelType = null,
  channelId = null,
  priority = null,
  metadata = {},
  createdByUserId,
}) {
  const { data: customer, error: customerError } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .limit(1)
    .maybeSingle();

  if (customerError) throw new HttpError(500, customerError.message || 'Failed to validate customer.');
  if (!customer) throw new HttpError(400, 'Customer does not belong to this organization.');

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      organization_id: organizationId,
      customer_id: customerId,
      assigned_to_member_id: assignedToMemberId ?? null,
      assignment_type: assignedToMemberId ? 'assigned_to_agent' : 'unassigned',
      source,
      channel_type: channelType ?? (source === 'email' ? 'email' : 'web'),
      channel_id: channelId ?? null,
      priority: priority ?? 'medium',
      created_by: createdByUserId,
      metadata,
    })
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to create conversation.');
  return data;
}

/**
 * Insert a message row. DB rules: `agent` and `internal_note` require `senderMemberId`;
 * `customer` forbids it; `ai` and `system` leave it optional (usually null).
 */
export async function createMessage({
  organizationId,
  conversationId,
  senderType,
  senderUserId,
  senderMemberId,
  content,
  metadata = {},
}) {
  const body = content?.trim();
  if (!body) throw new HttpError(400, 'Message content cannot be empty.');

  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('id, organization_id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .limit(1)
    .maybeSingle();

  if (convError) throw new HttpError(500, convError.message || 'Failed to validate conversation.');
  if (!conversation) throw new HttpError(404, 'Conversation not found in this organization.');

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      sender_type: senderType,
      sender_user_id: senderUserId ?? null,
      sender_member_id: senderMemberId ?? null,
      content: body,
      metadata,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23514') throw new HttpError(400, error.message || 'Message validation failed.');
    if (error.code === '23503') throw new HttpError(409, error.message || 'Conversation changed during write.');
    throw new HttpError(500, error.message || 'Failed to send message.');
  }
  return data;
}

/** Soft-flag spam (never deletes). Syncs `status` with spam bucket. */
export async function updateConversationSpam({
  organizationId,
  conversationId,
  isSpam,
  actorUserId,
}) {
  await ensureOrgMembership(actorUserId, organizationId);
  if (typeof isSpam !== 'boolean') {
    throw new HttpError(400, 'isSpam must be a boolean.');
  }

  const { data: current, error: loadErr } = await supabaseAdmin
    .from('conversations')
    .select('status')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (loadErr) {
    throw new HttpError(500, loadErr.message || 'Failed to load conversation.');
  }
  if (!current) {
    throw new HttpError(404, 'Conversation not found in this organization.');
  }

  const nextStatus = isSpam ? 'spam' : current.status === 'spam' ? 'open' : current.status;

  const spamPayload = isSpam
    ? {
        is_spam: true,
        status: 'spam',
        assigned_to_member_id: null,
        assignment_type: 'unassigned',
      }
    : { is_spam: false, status: nextStatus };

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update(spamPayload)
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to update spam flag.');
  }
  if (!data) {
    throw new HttpError(404, 'Conversation not found in this organization.');
  }
  return data;
}

/** Union user ids into conversations.metadata.mentions for inbox filter / realtime. */
export async function mergeConversationMentionUserIds({ organizationId, conversationId, userIds }) {
  if (!userIds?.length) return;

  const { data: row, error: fetchError } = await supabaseAdmin
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (fetchError) {
    throw new HttpError(500, fetchError.message || 'Failed to load conversation metadata.');
  }

  const meta = row?.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
  const prev = Array.isArray(meta.mentions) ? meta.mentions.map(String) : [];
  const next = [...new Set([...prev, ...userIds.map(String)])];
  meta.mentions = next;

  const { error: updateError } = await supabaseAdmin
    .from('conversations')
    .update({ metadata: meta })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (updateError) {
    throw new HttpError(500, updateError.message || 'Failed to merge conversation mentions.');
  }
}

/** Members + user profiles for inbox assignee labels and picker context. */
export async function listOrganizationMembersWithProfiles({ organizationId, actorUserId }) {
  await ensureOrgMembership(actorUserId, organizationId);

  const { data: members, error: membersError } = await supabaseAdmin
    .from('organization_members')
    .select('id, user_id, role')
    .eq('organization_id', organizationId);

  if (membersError) {
    throw new HttpError(500, membersError.message || 'Failed to load organization members.');
  }
  if (!members?.length) return [];

  const userIds = [...new Set(members.map((m) => m.user_id))];
  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, email, first_name, last_name')
    .in('id', userIds);

  if (usersError) {
    throw new HttpError(500, usersError.message || 'Failed to load user profiles.');
  }

  const byUserId = new Map((users ?? []).map((u) => [u.id, u]));

  return members.map((m) => {
    const u = byUserId.get(m.user_id);
    const fullName = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
    const displayName = fullName || (typeof u?.email === 'string' ? u.email.split('@')[0] : '') || 'Teammate';
    return {
      id: m.id,
      userId: m.user_id,
      role: m.role,
      email: u?.email ?? null,
      displayName,
    };
  });
}

export async function listMessages({ organizationId, conversationId, page, pageSize, from, to }) {
  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .limit(1)
    .maybeSingle();

  if (convError) throw new HttpError(500, convError.message || 'Failed to validate conversation.');
  if (!conversation) throw new HttpError(404, 'Conversation not found in this organization.');

  const { data, error, count } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .range(from, to);

  if (error) throw new HttpError(500, error.message || 'Failed to fetch messages.');
  return {
    items: data ?? [],
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
    },
  };
}
