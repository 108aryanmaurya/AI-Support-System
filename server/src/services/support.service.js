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
      source,
      channel_type: channelType ?? (source === 'email' ? 'email' : 'web'),
      channel_id: channelId ?? null,
      priority,
      created_by_user_id: createdByUserId,
      metadata,
    })
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to create conversation.');
  return data;
}

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

export async function listConversations({ organizationId, page, pageSize, from, to }) {
  const { data, error, count } = await supabaseAdmin
    .from('conversations')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .order('last_message_at', { ascending: false })
    .range(from, to);

  if (error) throw new HttpError(500, error.message || 'Failed to fetch conversations.');
  return {
    items: data ?? [],
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
    },
  };
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
