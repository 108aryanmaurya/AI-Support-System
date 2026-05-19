import assert from 'node:assert/strict';
import test from 'node:test';
import { mapLlmProviderError, parseRetryAfterSeconds } from './llm.providerErrors.js';

test('mapLlmProviderError maps OpenAI quota 429 to 503 provider_quota', () => {
  const err = mapLlmProviderError({
    status: 429,
    message:
      '429 You exceeded your current quota, please check your plan and billing details.',
    code: 'insufficient_quota',
  });
  assert.equal(err.status, 503);
  assert.equal(err.code, 'provider_quota');
  assert.match(err.message, /quota/i);
});

test('mapLlmProviderError maps provider rate limit 429 separately', () => {
  const err = mapLlmProviderError({
    status: 429,
    message: 'Rate limit reached for requests',
  });
  assert.equal(err.status, 503);
  assert.equal(err.code, 'provider_rate_limit');
  assert.equal(err.retryAfterSeconds, 30);
});

test('mapLlmProviderError gemini rate limit uses helpful message', () => {
  const err = mapLlmProviderError(
    { status: 429, message: 'Too many requests. Please try again later.' },
    { provider: 'gemini', providerLabel: 'Google Gemini' },
  );
  assert.equal(err.code, 'provider_rate_limit');
  assert.match(err.message, /Gemini/i);
  assert.match(err.message, /free tier/i);
});

test('parseRetryAfterSeconds reads numeric header', () => {
  const headers = new Headers({ 'retry-after': '45' });
  assert.equal(parseRetryAfterSeconds(headers), 45);
});
