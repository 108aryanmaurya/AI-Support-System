import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SEARCH_ERROR_CODES } from '@ai-support/shared';
import { parseStructuredSearchRequest } from './structuredSearch.service.js';

describe('parseStructuredSearchRequest', () => {
  it('parses q tokens and explicit params', () => {
    const parsed = parseStructuredSearchRequest({
      q: 'status:open refund',
      priority: 'high',
      page: '2',
      pageSize: '10',
    });
    assert.deepEqual(parsed.statuses, ['open']);
    assert.deepEqual(parsed.priorities, ['high']);
    assert.equal(parsed.text, 'refund');
    assert.equal(parsed.pagination.page, 2);
    assert.equal(parsed.pagination.pageSize, 10);
  });

  it('allows structured-only search without free text', () => {
    const parsed = parseStructuredSearchRequest({ status: 'open', assignee: 'me' });
    assert.equal(parsed.text, '');
    assert.deepEqual(parsed.statuses, ['open']);
    assert.deepEqual(parsed.assignees, ['me']);
  });

  it('rejects empty criteria with invalid_input code', () => {
    try {
      parseStructuredSearchRequest({});
      assert.fail('expected throw');
    } catch (err) {
      assert.equal(err.status, 400);
      assert.equal(err.code, SEARCH_ERROR_CODES.invalid_input);
    }
  });

  it('rejects invalid status enum', () => {
    try {
      parseStructuredSearchRequest({ status: 'not-a-status' });
      assert.fail('expected throw');
    } catch (err) {
      assert.equal(err.status, 400);
      assert.equal(err.code, SEARCH_ERROR_CODES.invalid_input);
    }
  });
});
