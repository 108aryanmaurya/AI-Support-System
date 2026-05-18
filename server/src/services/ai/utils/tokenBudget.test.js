import assert from 'node:assert/strict';
import test from 'node:test';
import { truncateConversation, truncateText } from './tokenBudget.js';

test('truncateText shortens long strings', () => {
  const out = truncateText('abcdefghij', 5);
  assert.equal(out.length, 5);
  assert.ok(out.endsWith('…'));
});

test('truncateConversation keeps recent messages within budget', () => {
  const messages = [
    { role: 'customer', content: 'aaaa' },
    { role: 'agent', content: 'bbbb' },
    { role: 'customer', content: 'cccc' },
  ];
  const { messages: kept, droppedCount, truncated } = truncateConversation(messages, 30);
  assert.equal(truncated, true);
  assert.ok(droppedCount >= 1);
  assert.ok(kept.length >= 1);
  assert.equal(kept.at(-1).content, 'cccc');
});

test('truncateConversation returns all when under budget', () => {
  const messages = [{ role: 'customer', content: 'hi' }];
  const { messages: kept, truncated } = truncateConversation(messages, 10_000);
  assert.equal(truncated, false);
  assert.equal(kept.length, 1);
});
