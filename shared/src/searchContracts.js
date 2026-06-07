/**
 * Search infrastructure contracts (Sprint 0 baseline).
 * Shared limits, entity types, and response shapes for inbox / semantic search APIs (S1+).
 */

/** Result entity kinds returned by org search endpoints. KB uses separate API. */
export const SEARCH_ENTITY_TYPES = Object.freeze(['conversation', 'message', 'customer']);

/** Channel filter values — matches `conversations.channel_type` check constraint. */
export const SEARCH_CHANNEL_TYPES = Object.freeze(['email', 'web', 'whatsapp', 'messenger']);

/** Structured query token prefixes (S1 parser). */
export const SEARCH_FILTER_TOKENS = Object.freeze([
  'status',
  'priority',
  'tag',
  'assignee',
  'channel',
]);

/** Input bounds and pagination defaults for search endpoints. */
export const SEARCH_LIMITS = Object.freeze({
  maxQueryLength: 200,
  defaultPageSize: 20,
  maxPageSize: 50,
  maxPage: 100,
});

/**
 * Stable machine-readable error codes for search responses.
 * HTTP status is chosen by the server; clients may branch on `code`.
 */
export const SEARCH_ERROR_CODES = Object.freeze({
  invalid_input: 'invalid_input',
  forbidden: 'forbidden',
  unavailable: 'unavailable',
  rate_limited: 'rate_limited',
});

/** @param {unknown} v */
export function isSearchEntityType(v) {
  return typeof v === 'string' && SEARCH_ENTITY_TYPES.includes(v);
}

/** @param {unknown} v */
export function isSearchChannelType(v) {
  return typeof v === 'string' && SEARCH_CHANNEL_TYPES.includes(v);
}

/**
 * Normalize page-based pagination for search list endpoints.
 * @param {{ page?: unknown, pageSize?: unknown }} raw
 * @returns {{ page: number, pageSize: number, offset: number }}
 */
export function normalizeSearchPagination(raw = {}) {
  const pageNum = Number(raw.page);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1;
  const cappedPage = Math.min(page, SEARCH_LIMITS.maxPage);

  const sizeNum = Number(raw.pageSize);
  const pageSize =
    Number.isFinite(sizeNum) && sizeNum >= 1
      ? Math.min(Math.floor(sizeNum), SEARCH_LIMITS.maxPageSize)
      : SEARCH_LIMITS.defaultPageSize;

  return {
    page: cappedPage,
    pageSize,
    offset: (cappedPage - 1) * pageSize,
  };
}

/**
 * Trim and validate free-text query; throws Error with message suitable for 400 mapping.
 * @param {unknown} query
 * @returns {string}
 */
export function normalizeSearchQuery(query) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) {
    throw new Error('q is required.');
  }
  if (q.length > SEARCH_LIMITS.maxQueryLength) {
    throw new Error(`q must be at most ${SEARCH_LIMITS.maxQueryLength} characters.`);
  }
  return q;
}

/**
 * Standard error JSON shape for search endpoints.
 * @param {string} message
 * @param {string} [code]
 */
export function searchErrorShape(message, code) {
  const body = { error: message };
  if (code && typeof code === 'string') {
    body.code = code;
  }
  return body;
}

/**
 * Degraded response when FTS/index tables are missing (fail safe).
 * @param {string} [message]
 */
export function searchUnavailableShape(message = 'Search is not available. Apply database migrations.') {
  return {
    available: false,
    error: message,
    code: SEARCH_ERROR_CODES.unavailable,
  };
}

/**
 * @typedef {Object} SearchResultItem
 * @property {'conversation' | 'message' | 'customer'} entityType
 * @property {string} entityId
 * @property {string} [conversationId] — parent thread for message hits
 * @property {string} title — subject, customer name, or preview label
 * @property {string} snippet — highlighted or truncated preview (no full thread body)
 * @property {number} [rank]
 * @property {string[]} [matchedFields]
 * @property {Record<string, unknown>} [metadata] — status, priority, channel, assignee id, etc.
 */

/**
 * @typedef {Object} SearchListResponse
 * @property {boolean} available
 * @property {string} [query]
 * @property {SearchResultItem[]} results
 * @property {{ page: number, pageSize: number, total: number, hasMore: boolean }} pagination
 */
