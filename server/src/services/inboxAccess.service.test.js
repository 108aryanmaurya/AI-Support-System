import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessInboxId } from './inboxAccess.service.js';

test('canAccessInboxId allows viewAll', () => {
  assert.equal(canAccessInboxId('a', [], true), true);
});

test('canAccessInboxId checks membership list', () => {
  assert.equal(canAccessInboxId('a', ['a', 'b'], false), true);
  assert.equal(canAccessInboxId('c', ['a', 'b'], false), false);
});
