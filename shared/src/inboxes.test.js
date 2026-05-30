import assert from 'node:assert/strict';
import test from 'node:test';
import { slugifyInboxName, mergeInboxSettings } from './inboxes.js';

test('slugifyInboxName normalizes names', () => {
  assert.equal(slugifyInboxName('Sales Team'), 'sales-team');
  assert.equal(slugifyInboxName('  '), 'inbox');
});

test('mergeInboxSettings bounds arrays', () => {
  const s = mergeInboxSettings({
    channels: ['email', 'web'],
    intents: ['billing'],
    tags: ['vip'],
  });
  assert.deepEqual(s.channels, ['email', 'web']);
  assert.equal(s.intents[0], 'billing');
});
