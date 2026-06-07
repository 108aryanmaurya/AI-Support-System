import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SEARCH_ERROR_CODES,
  SEARCH_LIMITS,
  isSearchChannelType,
  isSearchEntityType,
  normalizeSearchPagination,
  normalizeSearchQuery,
  searchErrorShape,
  searchUnavailableShape,
} from './searchContracts.js';

describe('searchContracts', () => {
  it('isSearchEntityType accepts known entities', () => {
    assert.equal(isSearchEntityType('conversation'), true);
    assert.equal(isSearchEntityType('kb'), false);
  });

  it('isSearchChannelType accepts DB channel values', () => {
    assert.equal(isSearchChannelType('email'), true);
    assert.equal(isSearchChannelType('sms'), false);
  });

  it('normalizeSearchQuery trims and enforces max length', () => {
    assert.equal(normalizeSearchQuery('  refund  '), 'refund');
    assert.throws(() => normalizeSearchQuery(''), /required/);
    assert.throws(
      () => normalizeSearchQuery('x'.repeat(SEARCH_LIMITS.maxQueryLength + 1)),
      /at most/,
    );
  });

  it('normalizeSearchPagination caps page and pageSize', () => {
    assert.deepEqual(normalizeSearchPagination({ page: 0, pageSize: 999 }), {
      page: 1,
      pageSize: SEARCH_LIMITS.maxPageSize,
      offset: 0,
    });
    assert.deepEqual(normalizeSearchPagination({ page: 500, pageSize: 10 }), {
      page: SEARCH_LIMITS.maxPage,
      pageSize: 10,
      offset: (SEARCH_LIMITS.maxPage - 1) * 10,
    });
  });

  it('searchErrorShape includes optional code', () => {
    assert.deepEqual(searchErrorShape('bad'), { error: 'bad' });
    assert.deepEqual(searchErrorShape('nope', SEARCH_ERROR_CODES.forbidden), {
      error: 'nope',
      code: 'forbidden',
    });
  });

  it('searchUnavailableShape is fail-safe', () => {
    const shape = searchUnavailableShape();
    assert.equal(shape.available, false);
    assert.equal(shape.code, SEARCH_ERROR_CODES.unavailable);
  });
});
