import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasAdvancedSearchCriteria,
  normalizeSearchFilterArrays,
  parseAdvancedSearchBody,
  parseSearchStringArray,
} from './advancedSearch.js';

describe('advancedSearch', () => {
  it('parseSearchStringArray dedupes and caps', () => {
    assert.deepEqual(parseSearchStringArray(['open', 'open', 'pending']), ['open', 'pending']);
  });

  it('normalizeSearchFilterArrays maps legacy single values', () => {
    assert.deepEqual(normalizeSearchFilterArrays({ status: 'open', channel: 'email' }), {
      statuses: ['open'],
      priorities: [],
      channels: ['email'],
      assignees: [],
      tags: [],
      aiIntents: [],
    });
  });

  it('parseAdvancedSearchBody accepts multi-select payload', () => {
    const parsed = parseAdvancedSearchBody({
      query: 'refund',
      status: ['open', 'pending'],
      priority: ['high'],
      assignee: ['me', 'unassigned'],
      tags: ['billing'],
      channel: ['email'],
      dateRange: { from: '2026-01-01T00:00:00.000Z', to: '2026-06-01T00:00:00.000Z' },
      entityType: 'all',
    });
    assert.equal(parsed.text, 'refund');
    assert.deepEqual(parsed.statuses, ['open', 'pending']);
    assert.deepEqual(parsed.assignees, ['me', 'unassigned']);
    assert.equal(parsed.includeFacets, true);
  });

  it('hasAdvancedSearchCriteria detects filter-only body', () => {
    assert.equal(hasAdvancedSearchCriteria({ statuses: ['open'], tags: [] }), true);
    assert.equal(hasAdvancedSearchCriteria({ statuses: [], tags: [] }), false);
  });
});
