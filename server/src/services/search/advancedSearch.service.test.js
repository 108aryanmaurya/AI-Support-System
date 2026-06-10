import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SEARCH_ERROR_CODES } from '@ai-support/shared';
import { parseAdvancedSearchRequest } from './advancedSearch.service.js';

describe('parseAdvancedSearchRequest', () => {
  it('parses multi-select advanced payload', () => {
    const parsed = parseAdvancedSearchRequest(
      {
        query: 'billing',
        status: ['open', 'pending'],
        priority: ['high'],
        assignee: ['me'],
        tags: ['refund'],
        channel: ['email'],
        page: 1,
        pageSize: 25,
      },
      'member-uuid',
    );
    assert.equal(parsed.text, 'billing');
    assert.deepEqual(parsed.statuses, ['open', 'pending']);
    assert.equal(parsed.pagination.pageSize, 25);
  });

  it('rejects invalid assignee token', () => {
    try {
      parseAdvancedSearchRequest({ status: ['open'], assignee: ['not-valid'] }, 'm1');
      assert.fail('expected throw');
    } catch (err) {
      assert.equal(err.status, 400);
      assert.equal(err.code, SEARCH_ERROR_CODES.invalid_input);
    }
  });
});
