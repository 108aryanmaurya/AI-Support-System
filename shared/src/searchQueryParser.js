import { SEARCH_FILTER_TOKENS } from './searchContracts.js';

const FILTER_TOKEN_SET = new Set(SEARCH_FILTER_TOKENS);

/**
 * Split on whitespace while keeping quoted segments intact.
 * @param {string} input
 * @returns {string[]}
 */
export function tokenizeSearchQuery(input) {
  const tokens = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (ch === '\\' && i + 1 < input.length) {
        current += input[i + 1];
        i += 1;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * @param {string} value
 */
function unquoteTokenValue(value) {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    return v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Parse `q` for structured tokens (`status:open`, `tag:"billing issue"`, etc.).
 * @param {unknown} raw
 * @returns {{ text: string, filters: { status?: string, priority?: string, assignee?: string, channel?: string, tags: string[] } }}
 */
export function parseSearchQuery(raw) {
  const input = typeof raw === 'string' ? raw.trim() : '';
  /** @type {{ status?: string, priority?: string, assignee?: string, channel?: string, tags: string[] }} */
  const filters = { tags: [] };
  const textParts = [];

  if (!input) {
    return { text: '', filters };
  }

  for (const token of tokenizeSearchQuery(input)) {
    const colon = token.indexOf(':');
    if (colon > 0) {
      const key = token.slice(0, colon).trim().toLowerCase();
      const value = unquoteTokenValue(token.slice(colon + 1));
      if (FILTER_TOKEN_SET.has(key) && value) {
        if (key === 'tag') {
          filters.tags.push(value);
        } else {
          filters[key] = value;
        }
        continue;
      }
    }
    textParts.push(token);
  }

  return { text: textParts.join(' ').trim(), filters };
}

/**
 * Whether a search request has any criteria (free text or structured filters).
 * @param {{ text?: string, filters?: Record<string, unknown>, status?: string, priority?: string, assignee?: string, channel?: string, tags?: string[], dateFrom?: string, dateTo?: string }} criteria
 */
export function hasSearchCriteria(criteria) {
  if (typeof criteria.text === 'string' && criteria.text.trim()) return true;
  if (criteria.status) return true;
  if (criteria.priority) return true;
  if (criteria.assignee) return true;
  if (criteria.channel) return true;
  if (criteria.dateFrom) return true;
  if (criteria.dateTo) return true;
  if (Array.isArray(criteria.tags) && criteria.tags.length > 0) return true;
  const f = criteria.filters;
  if (f && typeof f === 'object') {
    if (f.status || f.priority || f.assignee || f.channel) return true;
    if (Array.isArray(f.tags) && f.tags.length > 0) return true;
  }
  return false;
}
