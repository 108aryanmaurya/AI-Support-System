import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../../../utils/httpError.js';
import { parseSuggestReplyResponse } from './suggestion.parser.js';

test('parseSuggestReplyResponse accepts valid JSON', () => {
  const raw = JSON.stringify({
    reply: 'Thanks for reaching out.',
    confidence: 0.88,
    detected_language: 'en',
  });
  const parsed = parseSuggestReplyResponse(raw);
  assert.equal(parsed.reply, 'Thanks for reaching out.');
  assert.equal(parsed.confidence, 0.88);
  assert.equal(parsed.detectedLanguage, 'en');
});

test('parseSuggestReplyResponse rejects invalid JSON', () => {
  assert.throws(() => parseSuggestReplyResponse('not json'), (err) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 502);
    return true;
  });
});

test('parseSuggestReplyResponse rejects missing reply', () => {
  assert.throws(() => parseSuggestReplyResponse('{"confidence":0.5}'), (err) => {
    assert.equal(err.status, 502);
    return true;
  });
});
