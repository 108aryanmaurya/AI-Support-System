import {
  CONVERSATION_STATUSES,
  CONVERSATION_PRIORITIES,
  SEARCH_ERROR_CODES,
  SEARCH_LIMITS,
  hasOrgPermission,
  hasSearchCriteria,
  isConversationPriority,
  isConversationStatus,
  isSearchChannelType,
  normalizeSearchPagination,
  parseSearchQuery,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { listAccessibleInboxIds } from '../inboxAccess.service.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SEARCH_ENTITY_MODES = Object.freeze(['conversation', 'message', 'customer', 'all']);

function searchHttpError(status, message, code) {
  const err = new HttpError(status, message);
  if (code) err.code = code;
  return err;
}

function escapeIlike(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function parseIsoDateParam(raw, field) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') {
    throw searchHttpError(400, `${field} must be an ISO date string.`, SEARCH_ERROR_CODES.invalid_input);
  }
  const trimmed = raw.trim();
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    throw searchHttpError(400, `${field} must be a valid ISO date.`, SEARCH_ERROR_CODES.invalid_input);
  }
  return new Date(ms).toISOString();
}

/**
 * @param {string[]} tagNames
 */
function parseTagNamesParam(tagNames) {
  const names = [];
  for (const raw of tagNames) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    if (!name || name.length > 64) continue;
    if (!names.includes(name)) names.push(name);
    if (names.length >= 8) break;
  }
  return names;
}

/**
 * Merge `q` tokens with explicit query params (explicit wins on conflict).
 * @param {import('express').Request['query']} query
 */
export function parseStructuredSearchRequest(query) {
  const qRaw = typeof query.q === 'string' ? query.q : '';
  const parsed = parseSearchQuery(qRaw);

  const status =
    (typeof query.status === 'string' && query.status.trim()) || parsed.filters.status || null;
  const priority =
    (typeof query.priority === 'string' && query.priority.trim()) || parsed.filters.priority || null;
  const assignee =
    (typeof query.assignee === 'string' && query.assignee.trim()) || parsed.filters.assignee || null;
  const channel =
    (typeof query.channel === 'string' && query.channel.trim()) || parsed.filters.channel || null;

  const tagNames = [...parsed.filters.tags];
  if (typeof query.tag === 'string' && query.tag.trim()) {
    tagNames.push(query.tag.trim());
  }
  if (typeof query.tags === 'string' && query.tags.trim()) {
    for (const part of query.tags.split(',')) {
      const name = part.trim();
      if (name) tagNames.push(name);
    }
  }

  const entityTypeRaw =
    typeof query.entityType === 'string' ? query.entityType.trim().toLowerCase() : 'conversation';
  const entityType = SEARCH_ENTITY_MODES.includes(entityTypeRaw) ? entityTypeRaw : null;

  const text = parsed.text;
  const dateFrom = parseIsoDateParam(query.dateFrom, 'dateFrom');
  const dateTo = parseIsoDateParam(query.dateTo, 'dateTo');

  if (text.length > SEARCH_LIMITS.maxQueryLength) {
    throw searchHttpError(
      400,
      `q must be at most ${SEARCH_LIMITS.maxQueryLength} characters.`,
      SEARCH_ERROR_CODES.invalid_input,
    );
  }

  if (entityType == null) {
    throw searchHttpError(
      400,
      `entityType must be one of: ${SEARCH_ENTITY_MODES.join(', ')}.`,
      SEARCH_ERROR_CODES.invalid_input,
    );
  }

  if (status && !isConversationStatus(status)) {
    throw searchHttpError(
      400,
      `status must be one of: ${CONVERSATION_STATUSES.join(', ')}.`,
      SEARCH_ERROR_CODES.invalid_input,
    );
  }

  if (priority && !isConversationPriority(priority)) {
    throw searchHttpError(
      400,
      `priority must be one of: ${CONVERSATION_PRIORITIES.join(', ')}.`,
      SEARCH_ERROR_CODES.invalid_input,
    );
  }

  if (channel && !isSearchChannelType(channel)) {
    throw searchHttpError(
      400,
      'channel must be one of: email, web, whatsapp, messenger.',
      SEARCH_ERROR_CODES.invalid_input,
    );
  }

  if (dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo)) {
    throw searchHttpError(400, 'dateFrom must be before dateTo.', SEARCH_ERROR_CODES.invalid_input);
  }

  const criteria = {
    text,
    status,
    priority,
    assignee,
    channel,
    tags: parseTagNamesParam(tagNames),
    dateFrom,
    dateTo,
  };

  if (!hasSearchCriteria(criteria)) {
    throw searchHttpError(
      400,
      'Provide q and/or structured filters (status, priority, assignee, tag, channel, date range).',
      SEARCH_ERROR_CODES.invalid_input,
    );
  }

  const pagination = normalizeSearchPagination({
    page: query.page,
    pageSize: query.pageSize,
  });

  return { ...criteria, entityType, pagination, rawQuery: qRaw.trim() || null };
}

/**
 * @param {string | null} assignee
 * @param {string} memberId
 */
function resolveAssigneeMemberId(assignee, memberId) {
  if (!assignee) return { assigneeMemberId: null, unassignedOnly: false };
  const value = assignee.trim().toLowerCase();
  if (value === 'me') {
    return { assigneeMemberId: memberId, unassignedOnly: false };
  }
  if (value === 'unassigned' || value === 'none') {
    return { assigneeMemberId: null, unassignedOnly: true };
  }
  if (!UUID_RE.test(assignee.trim())) {
    throw searchHttpError(
      400,
      'assignee must be me, unassigned, or a member UUID.',
      SEARCH_ERROR_CODES.invalid_input,
    );
  }
  return { assigneeMemberId: assignee.trim(), unassignedOnly: false };
}

/**
 * @param {string} organizationId
 * @param {string[]} tagNames
 */
async function resolveTagIdsByNames(organizationId, tagNames) {
  if (!tagNames.length) return { tagIds: [], missingNames: [] };

  const { data, error } = await supabaseAdmin
    .from('tag_definitions')
    .select('id, name')
    .eq('organization_id', organizationId);

  if (error) {
    const missing = error.message?.includes('tag_definitions') || error.code === '42P01';
    if (missing) {
      throw new HttpError(503, 'Tags are not available. Apply database migrations.');
    }
    throw new HttpError(500, error.message || 'Failed to resolve tags.');
  }

  const byLower = new Map();
  for (const row of data ?? []) {
    if (row?.name && row?.id) byLower.set(String(row.name).toLowerCase(), row.id);
  }

  const tagIds = [];
  const missingNames = [];
  for (const name of tagNames) {
    const id = byLower.get(name.toLowerCase());
    if (id) tagIds.push(id);
    else missingNames.push(name);
  }
  return { tagIds, missingNames };
}

/**
 * @param {string} organizationId
 * @param {string[]} tagIds
 */
async function conversationIdsForAllTags(organizationId, tagIds) {
  if (!tagIds.length) return [];

  const { data, error } = await supabaseAdmin
    .from('conversation_tags')
    .select('conversation_id, tag_id')
    .eq('organization_id', organizationId)
    .in('tag_id', tagIds);

  if (error) {
    const missing = error.message?.includes('conversation_tags') || error.code === '42P01';
    if (missing) {
      throw new HttpError(503, 'Conversation tags are not available. Apply database migrations.');
    }
    throw new HttpError(500, error.message || 'Failed to filter by tag.');
  }

  const counts = new Map();
  for (const row of data ?? []) {
    if (!row?.conversation_id || !row?.tag_id) continue;
    counts.set(row.conversation_id, (counts.get(row.conversation_id) ?? 0) + 1);
  }

  const required = tagIds.length;
  return [...counts.entries()].filter(([, n]) => n >= required).map(([id]) => id);
}

/**
 * @param {string[]} inboxIds
 * @param {boolean} viewAll
 */
function applyInboxVisibilityFilter(query, inboxIds, viewAll) {
  if (viewAll) return query;
  if (!inboxIds.length) {
    throw searchHttpError(403, 'You are not a member of any inbox.', SEARCH_ERROR_CODES.forbidden);
  }
  const list = inboxIds.join(',');
  return query.or(`inbox_id.is.null,inbox_id.in.(${list})`);
}

function truncateSnippet(text, max = 160) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function conversationTitle(row) {
  const subject = typeof row.subject === 'string' ? row.subject.trim() : '';
  if (subject) return subject;
  const customer = row.customers;
  const name = customer?.name?.trim?.() || customer?.email?.trim?.();
  return name || 'Conversation';
}

function conversationSnippet(row, text) {
  const customer = row.customers;
  const parts = [];
  if (customer?.email) parts.push(customer.email);
  if (row.status) parts.push(row.status);
  if (row.priority) parts.push(row.priority);
  const base = parts.join(' · ');
  if (text && typeof row.subject === 'string' && row.subject.toLowerCase().includes(text.toLowerCase())) {
    return truncateSnippet(row.subject);
  }
  return truncateSnippet(base || row.subject || '');
}

function mapConversationRow(row, text, matchedFields) {
  return {
    entityType: 'conversation',
    entityId: row.id,
    conversationId: row.id,
    title: conversationTitle(row),
    snippet: conversationSnippet(row, text),
    rank: 1,
    matchedFields,
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
 * @param {object} params
 */
async function searchConversations({
  organizationId,
  membership,
  orgPermissions,
  text,
  status,
  priority,
  assignee,
  channel,
  tagNames,
  dateFrom,
  dateTo,
  pagination,
}) {
  const { inboxIds, viewAll } = await listAccessibleInboxIds({
    organizationId,
    membership,
    orgPermissions,
  });

  const { assigneeMemberId, unassignedOnly } = resolveAssigneeMemberId(
    assignee,
    membership.id,
  );

  const matchedFields = [];
  if (status) matchedFields.push('status');
  if (priority) matchedFields.push('priority');
  if (channel) matchedFields.push('channel');
  if (assignee) matchedFields.push('assignee');
  if (tagNames.length) matchedFields.push('tag');

  let tagConversationIds = null;
  if (tagNames.length) {
    const { tagIds, missingNames } = await resolveTagIdsByNames(organizationId, tagNames);
    if (missingNames.length === tagNames.length) {
      return {
        results: [],
        total: 0,
        appliedFilters: { tags: tagNames, tagsNotFound: missingNames },
      };
    }
    tagConversationIds = await conversationIdsForAllTags(organizationId, tagIds);
    if (tagConversationIds.length === 0) {
      return { results: [], total: 0, appliedFilters: { tags: tagNames } };
    }
  }

  let customerIdsForText = null;
  if (text) {
    const esc = escapeIlike(text);
    const { data: customers, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('organization_id', organizationId)
      .or(`email.ilike.%${esc}%,name.ilike.%${esc}%,phone.ilike.%${esc}%`)
      .limit(50);

    if (custErr) throw new HttpError(500, custErr.message || 'Customer lookup failed.');
    customerIdsForText = (customers ?? []).map((c) => c.id).filter(Boolean);
    matchedFields.push('text');
  }

  let query = supabaseAdmin
    .from('conversations')
    .select(
      'id, subject, status, priority, channel_type, assigned_to_member_id, last_message_at, created_at, inbox_id, customers(id, name, email)',
      { count: 'exact' },
    )
    .eq('organization_id', organizationId)
    .neq('status', 'spam')
    .eq('is_spam', false);

  query = applyInboxVisibilityFilter(query, inboxIds, viewAll);

  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  if (channel) query = query.eq('channel_type', channel);
  if (unassignedOnly) query = query.is('assigned_to_member_id', null);
  else if (assigneeMemberId) query = query.eq('assigned_to_member_id', assigneeMemberId);
  if (dateFrom) query = query.gte('last_message_at', dateFrom);
  if (dateTo) query = query.lte('last_message_at', dateTo);
  if (tagConversationIds) query = query.in('id', tagConversationIds);

  if (text) {
    const esc = escapeIlike(text);
    const parts = [`subject.ilike.%${esc}%`];
    if (customerIdsForText?.length) {
      parts.push(`customer_id.in.(${customerIdsForText.join(',')})`);
    }
    query = query.or(parts.join(','));
  }

  const { data, error, count } = await query
    .order('last_message_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.pageSize - 1);

  if (error) throw new HttpError(500, error.message || 'Conversation search failed.');

  const results = (data ?? []).map((row) => mapConversationRow(row, text, [...matchedFields]));

  return {
    results,
    total: count ?? results.length,
  };
}

/**
 * @param {object} params
 */
async function searchCustomers({ organizationId, text, pagination }) {
  if (!text) return { results: [], total: 0 };

  const esc = escapeIlike(text);
  let query = supabaseAdmin
    .from('customers')
    .select('id, name, email, phone, external_id, customer_type, created_at', { count: 'exact' })
    .eq('organization_id', organizationId)
    .or(`email.ilike.%${esc}%,name.ilike.%${esc}%,phone.ilike.%${esc}%,external_id.ilike.%${esc}%`);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.pageSize - 1);

  if (error) throw new HttpError(500, error.message || 'Customer search failed.');

  const results = (data ?? []).map((row) => ({
    entityType: 'customer',
    entityId: row.id,
    title: row.name?.trim() || row.email?.trim() || 'Customer',
    snippet: truncateSnippet([row.email, row.phone, row.external_id].filter(Boolean).join(' · ')),
    rank: 1,
    matchedFields: ['text'],
    metadata: {
      email: row.email ?? null,
      customerType: row.customer_type ?? null,
    },
  }));

  return { results, total: count ?? results.length };
}

/**
 * @param {object} params
 */
async function searchMessages({ organizationId, membership, orgPermissions, text, pagination }) {
  if (!text) return { results: [], total: 0 };

  const { inboxIds, viewAll } = await listAccessibleInboxIds({
    organizationId,
    membership,
    orgPermissions,
  });

  const includeInternalNotes = hasOrgPermission(orgPermissions, 'messages.internal_note');

  let query = supabaseAdmin
    .from('messages')
    .select(
      'id, conversation_id, content, sender_type, created_at, conversations!inner(id, subject, inbox_id, organization_id, customers(name, email))',
      { count: 'exact' },
    )
    .eq('organization_id', organizationId)
    .ilike('content', `%${escapeIlike(text)}%`);

  if (!includeInternalNotes) {
    query = query.neq('sender_type', 'internal_note');
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(0, pagination.pageSize - 1);

  if (error) throw new HttpError(500, error.message || 'Message search failed.');

  const rows = (data ?? []).filter((row) => {
    const conv = row.conversations;
    if (!conv || conv.organization_id !== organizationId) return false;
    const inboxId = conv.inbox_id;
    if (!inboxId) return true;
    if (viewAll) return true;
    return inboxIds.includes(inboxId);
  });

  const results = rows.map((row) => {
    const conv = row.conversations;
    const title =
      (typeof conv?.subject === 'string' && conv.subject.trim()) ||
      conv?.customers?.name?.trim?.() ||
      conv?.customers?.email?.trim?.() ||
      'Message';
    return {
      entityType: 'message',
      entityId: row.id,
      conversationId: row.conversation_id,
      title,
      snippet: truncateSnippet(row.content),
      rank: 1,
      matchedFields: ['content'],
      metadata: {
        senderType: row.sender_type,
        createdAt: row.created_at,
      },
    };
  });

  return { results, total: count ?? results.length };
}

/**
 * @param {object} params
 */
export async function structuredSearch({
  organizationId,
  membership,
  orgPermissions,
  criteria,
}) {
  const {
    text,
    status,
    priority,
    assignee,
    channel,
    tags,
    dateFrom,
    dateTo,
    entityType,
    pagination,
    rawQuery,
  } = criteria;

  let results = [];
  let total = 0;

  if (entityType === 'customer') {
    const customerHits = await searchCustomers({ organizationId, text, pagination });
    results = customerHits.results;
    total = customerHits.total;
  } else if (entityType === 'message') {
    const messageHits = await searchMessages({
      organizationId,
      membership,
      orgPermissions,
      text,
      pagination,
    });
    results = messageHits.results;
    total = messageHits.total;
  } else if (entityType === 'all') {
    const [convHits, customerHits, messageHits] = await Promise.all([
      searchConversations({
        organizationId,
        membership,
        orgPermissions,
        text,
        status,
        priority,
        assignee,
        channel,
        tagNames: tags,
        dateFrom,
        dateTo,
        pagination,
      }),
      text
        ? searchCustomers({
            organizationId,
            text,
            pagination: { ...pagination, offset: 0, pageSize: Math.min(5, pagination.pageSize) },
          })
        : Promise.resolve({ results: [], total: 0 }),
      text
        ? searchMessages({
            organizationId,
            membership,
            orgPermissions,
            text,
            pagination: { ...pagination, offset: 0, pageSize: Math.min(5, pagination.pageSize) },
          })
        : Promise.resolve({ results: [], total: 0 }),
    ]);
    results = [...convHits.results, ...customerHits.results, ...messageHits.results];
    total = convHits.total + customerHits.total + messageHits.total;
  } else {
    const convHits = await searchConversations({
      organizationId,
      membership,
      orgPermissions,
      text,
      status,
      priority,
      assignee,
      channel,
      tagNames: tags,
      dateFrom,
      dateTo,
      pagination,
    });
    results = convHits.results;
    total = convHits.total;
  }

  return {
    available: true,
    query: rawQuery ?? (text || null),
    results,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      hasMore: pagination.offset + results.length < total,
    },
    filters: {
      status: status ?? null,
      priority: priority ?? null,
      assignee: assignee ?? null,
      channel: channel ?? null,
      tags: tags ?? [],
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      entityType,
    },
  };
}
