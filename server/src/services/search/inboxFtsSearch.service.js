import { SEARCH_ERROR_CODES, searchUnavailableShape } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';

/**
 * @param {unknown} error
 */
export function isMissingInboxSearchRpc(error) {
  const msg = error?.message ?? '';
  return (
    error?.code === '42883' ||
    error?.code === 'PGRST202' ||
    msg.includes('search_inbox_conversations') ||
    msg.includes('search_inbox_messages') ||
    msg.includes('search_inbox_customers') ||
    msg.includes('search_tsv')
  );
}

/**
 * @param {unknown} error
 */
export function inboxSearchUnavailableError(error) {
  if (isMissingInboxSearchRpc(error)) {
    const err = new HttpError(503, searchUnavailableShape().error);
    err.code = SEARCH_ERROR_CODES.unavailable;
    return err;
  }
  return new HttpError(500, error?.message || 'Search failed.');
}

/**
 * @param {bigint | number | string | null | undefined} value
 */
function totalFromRows(rows, value) {
  if (!rows.length) return 0;
  const raw = value ?? rows[0]?.total_count;
  if (raw == null) return rows.length;
  return Number(raw);
}

/**
 * @param {object} row
 * @param {string[]} matchedFields
 */
export function mapConversationFtsRow(row, matchedFields) {
  const subject = typeof row.subject === 'string' ? row.subject.trim() : '';
  const customerName = row.customer_name?.trim?.() || '';
  const customerEmail = row.customer_email?.trim?.() || '';
  const title = subject || customerName || customerEmail || 'Conversation';

  return {
    entityType: 'conversation',
    entityId: row.conversation_id,
    conversationId: row.conversation_id,
    title,
    snippet: row.snippet || subject || customerEmail,
    rank: row.rank ?? 1,
    matchedFields: [...matchedFields, 'text'],
    metadata: {
      status: row.status ?? null,
      priority: row.priority ?? null,
      channelType: row.channel_type ?? null,
      assignedToMemberId: row.assigned_to_member_id ?? null,
      lastMessageAt: row.last_message_at ?? null,
    },
  };
}

/**
 * @param {object} row
 */
export function mapMessageFtsRow(row) {
  const title =
    (typeof row.conversation_subject === 'string' && row.conversation_subject.trim()) ||
    row.customer_name?.trim?.() ||
    row.customer_email?.trim?.() ||
    'Message';

  return {
    entityType: 'message',
    entityId: row.message_id,
    conversationId: row.conversation_id,
    title,
    snippet: row.snippet || row.content || '',
    rank: row.rank ?? 1,
    matchedFields: ['content'],
    metadata: {
      senderType: row.sender_type,
      createdAt: row.created_at,
    },
  };
}

/**
 * @param {object} row
 */
export function mapCustomerFtsRow(row) {
  return {
    entityType: 'customer',
    entityId: row.customer_id,
    title: row.name?.trim() || row.email?.trim() || 'Customer',
    snippet: row.snippet || [row.email, row.phone, row.external_id].filter(Boolean).join(' · '),
    rank: row.rank ?? 1,
    matchedFields: ['text'],
    metadata: {
      email: row.email ?? null,
      customerType: row.customer_type ?? null,
    },
  };
}

/**
 * @param {object} params
 */
export async function searchConversationsFts({
  organizationId,
  text,
  status,
  priority,
  channel,
  assigneeMemberId,
  unassignedOnly,
  tagIds,
  dateFrom,
  dateTo,
  inboxIds,
  viewAll,
  pagination,
  matchedFields,
}) {
  const { data, error } = await supabaseAdmin.rpc('search_inbox_conversations', {
    p_organization_id: organizationId,
    p_query: text,
    p_status: status ?? null,
    p_priority: priority ?? null,
    p_channel: channel ?? null,
    p_assignee_member_id: assigneeMemberId ?? null,
    p_unassigned_only: unassignedOnly === true,
    p_tag_ids: tagIds?.length ? tagIds : null,
    p_date_from: dateFrom ?? null,
    p_date_to: dateTo ?? null,
    p_inbox_ids: viewAll ? null : inboxIds,
    p_view_all_inboxes: viewAll === true,
    p_offset: pagination.offset,
    p_limit: pagination.pageSize,
  });

  if (error) throw inboxSearchUnavailableError(error);

  const rows = data ?? [];
  return {
    results: rows.map((row) => mapConversationFtsRow(row, matchedFields)),
    total: totalFromRows(rows),
  };
}

/**
 * @param {object} params
 */
export async function searchMessagesFts({
  organizationId,
  text,
  inboxIds,
  viewAll,
  includeInternalNotes,
  pagination,
}) {
  const { data, error } = await supabaseAdmin.rpc('search_inbox_messages', {
    p_organization_id: organizationId,
    p_query: text,
    p_inbox_ids: viewAll ? null : inboxIds,
    p_view_all_inboxes: viewAll === true,
    p_include_internal_notes: includeInternalNotes === true,
    p_offset: pagination.offset,
    p_limit: pagination.pageSize,
  });

  if (error) throw inboxSearchUnavailableError(error);

  const rows = data ?? [];
  return {
    results: rows.map(mapMessageFtsRow),
    total: totalFromRows(rows),
  };
}

/**
 * @param {object} params
 */
export async function searchCustomersFts({ organizationId, text, pagination }) {
  const { data, error } = await supabaseAdmin.rpc('search_inbox_customers', {
    p_organization_id: organizationId,
    p_query: text,
    p_offset: pagination.offset,
    p_limit: pagination.pageSize,
  });

  if (error) throw inboxSearchUnavailableError(error);

  const rows = data ?? [];
  return {
    results: rows.map(mapCustomerFtsRow),
    total: totalFromRows(rows),
  };
}
