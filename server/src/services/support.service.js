import { randomUUID } from 'node:crypto';
import { hasOrgPermission } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { getDefaultConversationAiEnabled } from './orgSettings.service.js';
import { clearConversationSlaAtRisk } from './ai/workflowConversationFlags.service.js';
import { touchLastCustomerMessageAt } from './lifecycle/lifecycleMessageTimestamps.service.js';
import { resolveInboxIdForNewConversation } from './inboxDefault.service.js';
import {
  applyResolvedInboxToConversation,
  resolveInboxForConversation,
} from './resolveInboxForConversation.service.js';

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
  aiEnabled = undefined,
  subject = null,
  threadKey = null,
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

  const resolvedAiEnabled =
    aiEnabled !== undefined ? Boolean(aiEnabled) : await getDefaultConversationAiEnabled(organizationId);

  const resolvedChannelType = channelType ?? (source === 'email' ? 'email' : 'web');
  const inbox_id = await resolveInboxIdForNewConversation(organizationId, metadata?.inbox_id ?? null);

  const insertRow = {
    organization_id: organizationId,
    customer_id: customerId,
    assigned_to_member_id: assignedToMemberId ?? null,
    assignment_type: assignedToMemberId ? 'assigned_to_agent' : 'unassigned',
    source,
    channel_type: resolvedChannelType,
    channel_id: channelId ?? null,
    priority: priority ?? 'medium',
    created_by: createdByUserId,
    metadata,
    ai_enabled: Boolean(resolvedAiEnabled),
    inbox_id,
  };

  if (resolvedChannelType === 'email') {
    const subj = typeof subject === 'string' ? subject.trim() : '';
    const tk = typeof threadKey === 'string' ? threadKey.trim() : '';
    insertRow.subject = subj || '(no subject)';
    insertRow.thread_key = tk || randomUUID();
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert(insertRow)
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to create conversation.');

  try {
    const routed = await resolveInboxForConversation({
      organizationId,
      conversation: data,
      channelType: resolvedChannelType,
      tagNames: [],
    });
    if (routed?.inboxId && routed.inboxId !== inbox_id) {
      await applyResolvedInboxToConversation({
        organizationId,
        conversationId: data.id,
        conversation: data,
        channelType: resolvedChannelType,
      });
      const { data: refreshed } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('id', data.id)
        .single();
      return refreshed ?? data;
    }
  } catch (routeErr) {
    console.warn(
      JSON.stringify({
        event: 'conversation.inbox_route_skipped',
        organization_id: organizationId,
        conversation_id: data.id,
        error: routeErr?.message ?? 'routing_failed',
      }),
    );
  }

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
  isAiGenerated = false,
  aiRunId = null,
  parentMessageId = null,
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
      is_ai_generated: isAiGenerated === true,
      ai_run_id: aiRunId ?? null,
      parent_message_id: parentMessageId ?? null,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23514') throw new HttpError(400, error.message || 'Message validation failed.');
    if (error.code === '23503') throw new HttpError(409, error.message || 'Conversation changed during write.');
    throw new HttpError(500, error.message || 'Failed to send message.');
  }

  if (senderType === 'agent') {
    await clearConversationSlaAtRisk({ organizationId, conversationId });
  }

  if (senderType === 'customer') {
    await touchLastCustomerMessageAt({
      organizationId,
      conversationId,
      at: data.created_at,
    });
  }

  return data;
}

/** Soft-flag spam (never deletes). Syncs `status` with spam bucket. */
export async function updateConversationSpam({
  organizationId,
  conversationId,
  isSpam,
  actorUserId,
  orgPermissions = undefined,
}) {
  const actorMember = await ensureOrgMembership(actorUserId, organizationId);
  if (orgPermissions) {
    if (!hasOrgPermission(orgPermissions, 'conversations.mark_spam')) {
      throw new HttpError(403, 'You cannot change spam status on conversations.');
    }
  }
  if (typeof isSpam !== 'boolean') {
    throw new HttpError(400, 'isSpam must be a boolean.');
  }

  const { data: current, error: loadErr } = await supabaseAdmin
    .from('conversations')
    .select('status, is_spam, channel_type')
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

  if (Boolean(current.is_spam) !== Boolean(data.is_spam)) {
    const { emitSupportEvent } = await import('./analytics/supportEvents.service.js');
    emitSupportEvent({
      organizationId,
      eventType: 'conversation.spam_changed',
      entityType: 'conversation',
      entityId: conversationId,
      actorMemberId: actorMember?.id ?? null,
      channelType: data.channel_type ?? null,
      payload: {
        is_spam: Boolean(data.is_spam),
        prior_is_spam: Boolean(current.is_spam),
        status: data.status,
      },
    });
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
