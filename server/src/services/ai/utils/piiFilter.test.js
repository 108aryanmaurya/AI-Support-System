import assert from 'node:assert/strict';
import test from 'node:test';
import { scrubPii } from './piiFilter.js';

test('scrubPii redacts bearer tokens', () => {
  const input = 'Auth header Bearer abcdefghijklmnopqrstuvwxyz123456';
  const out = scrubPii(input);
  assert.ok(!out.includes('abcdefghijklmnopqrstuvwxyz123456'));
  assert.match(out, /\[REDACTED_TOKEN\]/);
});

test('scrubPii redacts password fields', () => {
  const input = 'user password=SuperSecret123!';
  const out = scrubPii(input);
  assert.match(out, /password=\[REDACTED\]/i);
});

test('scrubPii redacts api keys', () => {
  const input = 'key sk-live-abcdefghijklmnopqrstuvwxyz';
  const out = scrubPii(input);
  assert.match(out, /\[REDACTED_API_KEY\]/);
});

test('scrubPii leaves benign text unchanged', () => {
  const input = 'Customer cannot log in after password reset email.';
  assert.equal(scrubPii(input), input);
});
