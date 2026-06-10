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
  normalizeSearchFilterArrays,
  normalizeSearchPagination,
  parseSearchQuery,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { listAccessibleInboxIds } from '../inboxAccess.service.js';
import {
  searchConversationsFts,
  searchCustomersFts,
  searchMessagesFts,
} from './inboxFtsSearch.service.js';
import {
  applyConversationFilters,
  buildMatchedFields,
  normalizeSearchCriteria,
} from './searchFilterUtils.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SEARCH_ENTITY_MODES = Object.freeze(['conversation', 'message', 'customer', 'all']);

function searchHttpError(status, message, code) {
  const err = new HttpError(status, message);
  if (code) err.code = code;
  return err;
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

  const arrays = normalizeSearchFilterArrays({
    status,
    priority,
    channel,
    assignee,
    tags: parseTagNamesParam(tagNames),
  });

  for (const a of arrays.assignees) {
    const lower = a.toLowerCase();
    if (!['me', 'unassigned', 'none'].includes(lower) && !UUID_RE.test(a)) {
      throw searchHttpError(
        400,
        'assignee must be me, unassigned, or a member UUID.',
        SEARCH_ERROR_CODES.invalid_input,
      );
    }
  }

  const criteria = {
    text,
    statuses: arrays.statuses,
    priorities: arrays.priorities,
    channels: arrays.channels,
    assignees: arrays.assignees,
    tags: arrays.tags,
    dateFrom,
    dateTo,
    slaAtRisk: null,
    aiIntents: [],
  };

  if (!hasSearchCriteria({
    text,
    status: arrays.statuses[0],
    priority: arrays.priorities[0],
    assignee: arrays.assignees[0],
    channel: arrays.channels[0],
    tags: arrays.tags,
    dateFrom,
    dateTo,
  })) {
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
  criteria,
}) {
  const { inboxIds, viewAll } = await listAccessibleInboxIds({
    organizationId,
    membership,
    orgPermissions,
  });

  const matchedFields = buildMatchedFields(criteria);
  const tagNames = criteria.tags ?? [];

  let tagIds = null;
  if (tagNames.length) {
    const resolved = await resolveTagIdsByNames(organizationId, tagNames);
    if (resolved.missingNames.length === tagNames.length) {
      return {
        results: [],
        total: 0,
        appliedFilters: { tags: tagNames, tagsNotFound: resolved.missingNames },
      };
    }
    tagIds = resolved.tagIds;
    if (!tagIds.length) {
      return { results: [], total: 0, appliedFilters: { tags: tagNames } };
    }
  }

  if (criteria.text) {
    return searchConversationsFts({
      organizationId,
      text: criteria.text,
      statuses: criteria.statuses,
      priorities: criteria.priorities,
      channels: criteria.channels,
      assigneeMemberIds: criteria.assigneeMemberIds,
      includeUnassigned: criteria.includeUnassigned,
      tagIds,
      dateFrom: criteria.dateFrom,
      dateTo: criteria.dateTo,
      inboxIds,
      viewAll,
      boostMemberId: membership.id,
      aiIntents: criteria.aiIntents,
      slaAtRisk: criteria.slaAtRisk,
      pagination: criteria.pagination,
      matchedFields,
    });
  }

  let tagConversationIds = null;
  if (tagIds?.length) {
    tagConversationIds = await conversationIdsForAllTags(organizationId, tagIds);
    if (tagConversationIds.length === 0) {
      return { results: [], total: 0, appliedFilters: { tags: tagNames } };
    }
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
  query = applyConversationFilters(query, criteria);
  if (tagConversationIds) query = query.in('id', tagConversationIds);

  const { data, error, count } = await query
    .order('last_message_at', { ascending: false })
    .range(criteria.pagination.offset, criteria.pagination.offset + criteria.pagination.pageSize - 1);

  if (error) throw new HttpError(500, error.message || 'Conversation search failed.');

  const results = (data ?? []).map((row) =>
    mapConversationRow(row, criteria.text, [...matchedFields]),
  );

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
  return searchCustomersFts({ organizationId, text, pagination });
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

  return searchMessagesFts({
    organizationId,
    text,
    inboxIds,
    viewAll,
    includeInternalNotes,
    pagination,
  });
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
  const normalized = normalizeSearchCriteria({ ...criteria, memberId: membership.id });
  const { text, entityType, pagination, rawQuery } = normalized;

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
        criteria: normalized,
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
      criteria: normalized,
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
      status: normalized.statuses,
      priority: normalized.priorities,
      assignee: normalized.assignees,
      channel: normalized.channels,
      tags: normalized.tags,
      aiIntents: normalized.aiIntents,
      slaAtRisk: normalized.slaAtRisk,
      dateFrom: normalized.dateFrom,
      dateTo: normalized.dateTo,
      entityType,
    },
  };
}
