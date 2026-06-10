import { normalizeSearchFilterArrays } from '@ai-support/shared';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Merge legacy single-value criteria with normalized multi-select arrays.
 * @param {Record<string, unknown>} criteria
 */
export function normalizeSearchCriteria(criteria) {
  const arrays = normalizeSearchFilterArrays(criteria);
  const text = typeof criteria.text === 'string' ? criteria.text.trim() : '';

  const assigneeResolution = resolveAssigneeFilters(arrays.assignees, criteria.memberId);

  return {
    text,
    statuses: arrays.statuses,
    priorities: arrays.priorities,
    channels: arrays.channels,
    tags: arrays.tags,
    aiIntents: arrays.aiIntents,
    assignees: arrays.assignees,
    assigneeMemberIds: assigneeResolution.memberIds,
    includeUnassigned: assigneeResolution.includeUnassigned,
    dateFrom: criteria.dateFrom ?? null,
    dateTo: criteria.dateTo ?? null,
    slaAtRisk: criteria.slaAtRisk === true ? true : null,
    entityType: criteria.entityType ?? 'conversation',
    pagination: criteria.pagination,
    rawQuery: criteria.rawQuery ?? (text || null),
    includeFacets: criteria.includeFacets === true,
  };
}

/**
 * @param {string[]} assignees
 * @param {string} memberId
 */
export function resolveAssigneeFilters(assignees, memberId) {
  const memberIds = [];
  let includeUnassigned = false;

  for (const raw of assignees) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    if (value === 'me') {
      if (memberId) memberIds.push(memberId);
      continue;
    }
    if (value === 'unassigned' || value === 'none') {
      includeUnassigned = true;
      continue;
    }
    if (UUID_RE.test(raw.trim()) && !memberIds.includes(raw.trim())) {
      memberIds.push(raw.trim());
    }
  }

  return { memberIds, includeUnassigned };
}

/**
 * @param {ReturnType<typeof normalizeSearchCriteria>} criteria
 */
export function buildMatchedFields(criteria) {
  const matched = [];
  if (criteria.statuses.length) matched.push('status');
  if (criteria.priorities.length) matched.push('priority');
  if (criteria.channels.length) matched.push('channel');
  if (criteria.assignees.length) matched.push('assignee');
  if (criteria.tags.length) matched.push('tag');
  if (criteria.aiIntents.length) matched.push('aiIntent');
  if (criteria.slaAtRisk) matched.push('slaAtRisk');
  return matched;
}

/**
 * Apply multi-select conversation filters to a Supabase query builder.
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} query
 * @param {ReturnType<typeof normalizeSearchCriteria>} criteria
 */
export function applyConversationFilters(query, criteria) {
  if (criteria.statuses.length) query = query.in('status', criteria.statuses);
  if (criteria.priorities.length) query = query.in('priority', criteria.priorities);
  if (criteria.channels.length) query = query.in('channel_type', criteria.channels);
  if (criteria.dateFrom) query = query.gte('last_message_at', criteria.dateFrom);
  if (criteria.dateTo) query = query.lte('last_message_at', criteria.dateTo);
  if (criteria.slaAtRisk) query = query.eq('waiting_status', 'waiting_agent');

  if (criteria.aiIntents.length) {
    query = query.in('metadata->ai->>intent', criteria.aiIntents);
  }

  const { memberIds, includeUnassigned } = criteria;
  if (memberIds.length && includeUnassigned) {
    query = query.or(
      `assigned_to_member_id.in.(${memberIds.join(',')}),assigned_to_member_id.is.null`,
    );
  } else if (memberIds.length) {
    query = query.in('assigned_to_member_id', memberIds);
  } else if (includeUnassigned) {
    query = query.is('assigned_to_member_id', null);
  }

  return query;
}
