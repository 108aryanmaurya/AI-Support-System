import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inferLlmProviderFromEnv,
  normalizeLlmProviderId,
  resolveLlmApiKey,
  resolveLlmConfig,
  resolveLlmProviderId,
} from './llm.config.js';

test('normalizeLlmProviderId defaults unknown to openai', () => {
  assert.equal(normalizeLlmProviderId('gemini'), 'gemini');
  assert.equal(normalizeLlmProviderId('invalid'), 'openai');
});

test('resolveLlmApiKey prefers LLM_API_KEY', () => {
  const prev = process.env.LLM_API_KEY;
  const prevGemini = process.env.GEMINI_API_KEY;
  process.env.LLM_API_KEY = 'universal-key';
  process.env.GEMINI_API_KEY = 'gemini-only';
  try {
    assert.equal(resolveLlmApiKey('gemini'), 'universal-key');
  } finally {
    if (prev === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = prev;
    if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGemini;
  }
});

test('inferLlmProviderFromEnv detects Gemini key and model', () => {
  const prevProvider = process.env.LLM_PROVIDER;
  const prevKey = process.env.LLM_API_KEY;
  const prevModel = process.env.LLM_MODEL;
  delete process.env.LLM_PROVIDER;
  process.env.LLM_API_KEY = 'AIzaSyTestKey123456789';
  process.env.LLM_MODEL = 'gemini-2.0-flash';
  try {
    assert.equal(inferLlmProviderFromEnv(), 'gemini');
    assert.equal(resolveLlmProviderId(), 'gemini');
    const cfg = resolveLlmConfig();
    assert.equal(cfg.providerLabel, 'Google Gemini');
    assert.match(cfg.baseUrl, /generativelanguage\.googleapis\.com/);
  } finally {
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
    if (prevKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = prevKey;
    if (prevModel === undefined) delete process.env.LLM_MODEL;
    else process.env.LLM_MODEL = prevModel;
  }
});

test('resolveLlmConfig applies gemini preset base URL', () => {
  const prevProvider = process.env.LLM_PROVIDER;
  const prevBase = process.env.LLM_BASE_URL;
  const prevModel = process.env.LLM_MODEL;
  process.env.LLM_PROVIDER = 'gemini';
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_MODEL;
  try {
    const cfg = resolveLlmConfig();
    assert.equal(cfg.provider, 'gemini');
    assert.match(cfg.baseUrl, /generativelanguage\.googleapis\.com/);
    assert.equal(cfg.model, 'gemini-2.0-flash');
  } finally {
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
    if (prevBase === undefined) delete process.env.LLM_BASE_URL;
    else process.env.LLM_BASE_URL = prevBase;
    if (prevModel === undefined) delete process.env.LLM_MODEL;
    else process.env.LLM_MODEL = prevModel;
  }
});
