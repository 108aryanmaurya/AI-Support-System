import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasSearchCriteria, parseSearchQuery, tokenizeSearchQuery } from './searchQueryParser.js';

describe('searchQueryParser', () => {
  it('tokenizeSearchQuery respects quotes', () => {
    assert.deepEqual(tokenizeSearchQuery('status:open tag:"billing issue" refund'), [
      'status:open',
      'tag:billing issue',
      'refund',
    ]);
  });

  it('parseSearchQuery extracts filters and free text', () => {
    const parsed = parseSearchQuery('status:open priority:high assignee:me tag:billing refund');
    assert.equal(parsed.text, 'refund');
    assert.equal(parsed.filters.status, 'open');
    assert.equal(parsed.filters.priority, 'high');
    assert.equal(parsed.filters.assignee, 'me');
    assert.deepEqual(parsed.filters.tags, ['billing']);

    const quoted = parseSearchQuery('tag:"billing issue"');
    assert.deepEqual(quoted.filters.tags, ['billing issue']);
  });

  it('parseSearchQuery keeps unknown token:key as text', () => {
    const parsed = parseSearchQuery('foo:bar hello');
    assert.equal(parsed.text, 'foo:bar hello');
    assert.deepEqual(parsed.filters.tags, []);
  });

  it('hasSearchCriteria detects structured-only queries', () => {
    assert.equal(hasSearchCriteria({ status: 'open' }), true);
    assert.equal(hasSearchCriteria({ text: '', filters: { tags: ['a'] } }), true);
    assert.equal(hasSearchCriteria({}), false);
  });
});
