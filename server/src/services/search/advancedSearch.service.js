import {
  SEARCH_ERROR_CODES,
  normalizeSearchPagination,
  parseAdvancedSearchBody,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { listAccessibleInboxIds } from '../inboxAccess.service.js';
import { searchInboxFacets } from './inboxFtsSearch.service.js';
import { normalizeSearchCriteria } from './searchFilterUtils.js';
import { structuredSearch } from './structuredSearch.service.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function searchHttpError(status, message, code) {
  const err = new HttpError(status, message);
  if (code) err.code = code;
  return err;
}

/**
 * @param {import('express').Request['body']} body
 * @param {string} memberId
 */
export function parseAdvancedSearchRequest(body, memberId) {
  try {
    const parsed = parseAdvancedSearchBody(body);
    for (const a of parsed.assignees) {
      const lower = a.toLowerCase();
      if (!['me', 'unassigned', 'none'].includes(lower) && !UUID_RE.test(a)) {
        throw new Error('assignee entries must be me, unassigned, or a member UUID.');
      }
    }
    const pagination = normalizeSearchPagination({
      page: body?.page,
      pageSize: body?.pageSize,
    });
    return {
      ...parsed,
      pagination,
      memberId,
    };
  } catch (e) {
    throw searchHttpError(
      400,
      e instanceof Error ? e.message : 'Invalid advanced search payload.',
      SEARCH_ERROR_CODES.invalid_input,
    );
  }
}

/**
 * @param {string} organizationId
 * @param {string[]} tagNames
 */
async function resolveTagIdsForFacets(organizationId, tagNames) {
  if (!tagNames.length) return null;
  const { data, error } = await supabaseAdmin
    .from('tag_definitions')
    .select('id, name')
    .eq('organization_id', organizationId);
  if (error) return null;
  const byLower = new Map();
  for (const row of data ?? []) {
    if (row?.name && row?.id) byLower.set(String(row.name).toLowerCase(), row.id);
  }
  const tagIds = [];
  for (const name of tagNames) {
    const id = byLower.get(name.toLowerCase());
    if (id) tagIds.push(id);
  }
  return tagIds.length ? tagIds : null;
}

/**
 * @param {object} params
 */
export async function advancedSearch({
  organizationId,
  membership,
  orgPermissions,
  criteria,
}) {
  const normalized = normalizeSearchCriteria({ ...criteria, memberId: membership.id });
  const searchResult = await structuredSearch({
    organizationId,
    membership,
    orgPermissions,
    criteria: normalized,
  });

  if (!criteria.includeFacets) {
    return searchResult;
  }

  const { inboxIds, viewAll } = await listAccessibleInboxIds({
    organizationId,
    membership,
    orgPermissions,
  });

  if (!viewAll && !inboxIds.length) {
    throw searchHttpError(403, 'You are not a member of any inbox.', SEARCH_ERROR_CODES.forbidden);
  }

  const facets = await searchInboxFacets({
    organizationId,
    text: normalized.text,
    statuses: normalized.statuses,
    priorities: normalized.priorities,
    channels: normalized.channels,
    assigneeMemberIds: normalized.assigneeMemberIds,
    includeUnassigned: normalized.includeUnassigned,
    tagIds: await resolveTagIdsForFacets(organizationId, normalized.tags),
    dateFrom: normalized.dateFrom,
    dateTo: normalized.dateTo,
    inboxIds,
    viewAll,
    aiIntents: normalized.aiIntents,
    slaAtRisk: normalized.slaAtRisk,
  });

  return { ...searchResult, facets };
}
