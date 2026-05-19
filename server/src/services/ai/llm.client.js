import { HttpError } from '../../utils/httpError.js';
import { env } from '../../config/env.js';
import {
  isLlmConfigReady,
  resolveLlmConfig,
  validateLlmConfig,
} from './llm.config.js';
import { chatCompletionOpenAiCompatible } from './providers/openaiCompatible.provider.js';

/**
 * @returns {import('./llm.config.js').ResolvedLlmConfig}
 */
function getConfig() {
  return env.llm ?? resolveLlmConfig();
}

export function isLlmConfigured() {
  return isLlmConfigReady(getConfig());
}

/**
 * Public status for health checks and settings UI.
 */
export function getLlmStatus() {
  const config = getConfig();
  const issues = validateLlmConfig(config);
  return {
    configured: issues.length === 0,
    provider: config.provider,
    providerLabel: config.providerLabel,
    model: config.model,
    baseUrlHost: safeHost(config.baseUrl),
    issues,
  };
}

/**
 * @param {string} url
 */
function safeHost(url) {
  if (!url) return null;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).host;
  } catch {
    return null;
  }
}

/**
 * @param {object} params
 * @param {Array<{ role: 'system' | 'user' | 'assistant', content: string }>} params.messages
 * @param {number} [params.maxTokens]
 * @param {number} [params.temperature]
 * @param {'text' | 'json'} [params.responseFormat]
 */
export async function chatCompletion({
  messages,
  maxTokens,
  temperature = 0.4,
  responseFormat = 'text',
}) {
  const config = getConfig();
  if (!isLlmConfigReady(config)) {
    const hint = validateLlmConfig(config)[0] || 'Set LLM_API_KEY and LLM_PROVIDER in server environment.';
    throw new HttpError(503, `AI provider is not configured. ${hint}`);
  }

  return chatCompletionOpenAiCompatible(config, {
    messages,
    maxTokens,
    temperature,
    responseFormat,
  });
}

/** @deprecated Import from llm.providerErrors.js */
export { mapLlmProviderError } from './llm.providerErrors.js';
