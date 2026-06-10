import { CLASSIFICATION_INTENTS } from './aiClassification.js';
import { CONVERSATION_PRIORITIES, CONVERSATION_STATUSES } from './conversationWorkspace.js';
import { SEARCH_CHANNEL_TYPES, SEARCH_LIMITS } from './searchContracts.js';
import { hasSearchCriteria } from './searchQueryParser.js';

export const ADVANCED_SEARCH_LIMITS = Object.freeze({
  maxMultiSelect: 8,
  maxSavedSearches: 12,
  savedSearchNameMax: 64,
});

const ENTITY_MODES = Object.freeze(['conversation', 'message', 'customer', 'all']);

/**
 * @param {unknown} raw
 * @param {number} [max]
 * @returns {string[]}
 */
export function parseSearchStringArray(raw, max = ADVANCED_SEARCH_LIMITS.maxMultiSelect) {
  if (raw == null) return [];
  const src = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const out = [];
  for (const item of src) {
    if (typeof item !== 'string') continue;
    const v = item.trim();
    if (!v || out.includes(v)) continue;
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function parseOptionalIsoDate(raw, field) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') {
    throw new Error(`${field} must be an ISO date string.`);
  }
  const ms = Date.parse(raw.trim());
  if (!Number.isFinite(ms)) {
    throw new Error(`${field} must be a valid ISO date.`);
  }
  return new Date(ms).toISOString();
}

/**
 * Normalize GET (single-value) or POST (multi-value) criteria into arrays.
 * @param {Record<string, unknown>} raw
 */
export function normalizeSearchFilterArrays(raw = {}) {
  const statuses = parseSearchStringArray(raw.statuses ?? raw.status);
  const priorities = parseSearchStringArray(raw.priorities ?? raw.priority);
  const channels = parseSearchStringArray(raw.channels ?? raw.channel);
  const assignees = parseSearchStringArray(raw.assignees ?? raw.assignee);
  const tags = parseSearchStringArray(raw.tags ?? []);
  if (typeof raw.tag === 'string' && raw.tag.trim()) {
    tags.push(raw.tag.trim());
  }
  const aiIntents = parseSearchStringArray(raw.aiIntents ?? raw.aiIntent ?? []);

  return {
    statuses: [...new Set(statuses)],
    priorities: [...new Set(priorities)],
    channels: [...new Set(channels)],
    assignees: [...new Set(assignees)],
    tags: [...new Set(tags)].slice(0, ADVANCED_SEARCH_LIMITS.maxMultiSelect),
    aiIntents: [...new Set(aiIntents)],
  };
}

/**
 * @param {unknown} body
 */
export function parseAdvancedSearchBody(body) {
  const src = body && typeof body === 'object' ? body : {};
  const queryRaw = typeof src.query === 'string' ? src.query : typeof src.q === 'string' ? src.q : '';
  const text = queryRaw.trim();

  if (text.length > SEARCH_LIMITS.maxQueryLength) {
    throw new Error(`query must be at most ${SEARCH_LIMITS.maxQueryLength} characters.`);
  }

  const arrays = normalizeSearchFilterArrays(src);
  for (const s of arrays.statuses) {
    if (!CONVERSATION_STATUSES.includes(s)) {
      throw new Error(`Invalid status: ${s}`);
    }
  }
  for (const p of arrays.priorities) {
    if (!CONVERSATION_PRIORITIES.includes(p)) {
      throw new Error(`Invalid priority: ${p}`);
    }
  }
  for (const ch of arrays.channels) {
    if (!SEARCH_CHANNEL_TYPES.includes(ch)) {
      throw new Error(`Invalid channel: ${ch}`);
    }
  }
  for (const intent of arrays.aiIntents) {
    if (!CLASSIFICATION_INTENTS.includes(intent)) {
      throw new Error(`Invalid aiIntent: ${intent}`);
    }
  }

  const dateRange =
    src.dateRange && typeof src.dateRange === 'object' ? src.dateRange : {};
  const dateFrom = parseOptionalIsoDate(dateRange.from ?? src.dateFrom, 'dateFrom');
  const dateTo = parseOptionalIsoDate(dateRange.to ?? src.dateTo, 'dateTo');
  if (dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo)) {
    throw new Error('dateRange.from must be before dateRange.to.');
  }

  const entityTypeRaw =
    typeof src.entityType === 'string' ? src.entityType.trim().toLowerCase() : 'conversation';
  if (!ENTITY_MODES.includes(entityTypeRaw)) {
    throw new Error(`entityType must be one of: ${ENTITY_MODES.join(', ')}.`);
  }

  const slaAtRisk =
    src.slaAtRisk === true ? true : src.slaAtRisk === false ? false : null;

  const criteria = {
    text,
    ...arrays,
    dateFrom,
    dateTo,
    slaAtRisk,
    entityType: entityTypeRaw,
    includeFacets: src.includeFacets !== false,
    rawQuery: text || null,
  };

  if (!hasAdvancedSearchCriteria(criteria)) {
    throw new Error(
      'Provide query and/or filters (status, priority, assignee, tags, channel, date range).',
    );
  }

  return criteria;
}

/**
 * @param {Record<string, unknown>} criteria
 */
export function hasAdvancedSearchCriteria(criteria) {
  return hasSearchCriteria({
    text: criteria.text,
    status: criteria.statuses?.[0],
    priority: criteria.priorities?.[0],
    assignee: criteria.assignees?.[0],
    channel: criteria.channels?.[0],
    tags: criteria.tags,
    dateFrom: criteria.dateFrom,
    dateTo: criteria.dateTo,
  });
}
