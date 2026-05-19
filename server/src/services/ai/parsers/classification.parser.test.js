import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClassificationResponse } from './classification.parser.js';

test('parseClassificationResponse parses valid payload', () => {
  const raw = JSON.stringify({
    intent: 'billing_issue',
    sentiment: 'negative',
    sentiment_score: 0.82,
    language: 'en',
    auto_tags: ['Refund', 'urgent'],
  });

  const out = parseClassificationResponse(raw);
  assert.equal(out.intent, 'billing_issue');
  assert.equal(out.sentiment, 'negative');
  assert.equal(out.sentiment_score, 0.82);
  assert.equal(out.language, 'en');
  assert.deepEqual(out.auto_tags, ['refund', 'urgent']);
});

test('parseClassificationResponse falls back intent to other', () => {
  const raw = JSON.stringify({
    intent: 'unknown_widget',
    sentiment: 'neutral',
    sentiment_score: 0.2,
    language: 'en',
    auto_tags: [],
  });

  const out = parseClassificationResponse(raw);
  assert.equal(out.intent, 'other');
});
