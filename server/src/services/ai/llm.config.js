/**
 * LLM provider presets. Most providers expose an OpenAI-compatible chat API;
 * set LLM_PROVIDER to switch presets, or use "custom" with LLM_BASE_URL + LLM_MODEL.
 *
 * @see https://ai.google.dev/gemini-api/docs/openai (Gemini)
 */

export const LLM_PROVIDERS = Object.freeze([
  'openai',
  'gemini',
  'groq',
  'together',
  'openrouter',
  'custom',
]);

/** @typedef {(typeof LLM_PROVIDERS)[number]} LlmProviderId */

/**
 * @typedef {object} LlmProviderPreset
 * @property {string} label
 * @property {string} baseUrl
 * @property {string} defaultModel
 * @property {string[]} apiKeyEnvVars - checked in order after LLM_API_KEY
 */

/** @type {Record<LlmProviderId, LlmProviderPreset>} */
export const LLM_PROVIDER_PRESETS = Object.freeze({
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    apiKeyEnvVars: ['OPENAI_API_KEY'],
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.0-flash',
    apiKeyEnvVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    apiKeyEnvVars: ['GROQ_API_KEY'],
  },
  together: {
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    apiKeyEnvVars: ['TOGETHER_API_KEY'],
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    apiKeyEnvVars: ['OPENROUTER_API_KEY'],
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    defaultModel: 'gpt-4o-mini',
    apiKeyEnvVars: [],
  },
});

/**
 * @param {unknown} value
 * @returns {LlmProviderId}
 */
export function normalizeLlmProviderId(value) {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (LLM_PROVIDERS.includes(id)) return id;
  return 'openai';
}

/**
 * When LLM_PROVIDER is unset, infer from key shape, model name, or base URL.
 * @returns {LlmProviderId | null}
 */
export function inferLlmProviderFromEnv() {
  const universal = process.env.LLM_API_KEY?.trim() ?? '';
  if (universal.startsWith('AIza')) return 'gemini';
  if (universal.startsWith('gsk_')) return 'groq';
  if (universal.startsWith('sk-or-')) return 'openrouter';

  if (process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()) {
    return 'gemini';
  }
  if (process.env.GROQ_API_KEY?.trim()) return 'groq';
  if (process.env.OPENROUTER_API_KEY?.trim()) return 'openrouter';
  if (process.env.TOGETHER_API_KEY?.trim()) return 'together';
  if (process.env.OPENAI_API_KEY?.trim()) return 'openai';

  const model = (process.env.LLM_MODEL ?? '').trim().toLowerCase();
  if (model.startsWith('gemini')) return 'gemini';
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';

  const base = (process.env.LLM_BASE_URL ?? '').toLowerCase();
  if (base.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (base.includes('groq.com')) return 'groq';
  if (base.includes('openrouter.ai')) return 'openrouter';
  if (base.includes('together.xyz')) return 'together';
  if (base.includes('api.openai.com')) return 'openai';

  return null;
}

/**
 * @returns {LlmProviderId}
 */
export function resolveLlmProviderId() {
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit && LLM_PROVIDERS.includes(explicit)) {
    return explicit;
  }
  return inferLlmProviderFromEnv() ?? 'openai';
}

/**
 * Resolve API key: LLM_API_KEY first, then provider-specific env vars.
 * @param {LlmProviderId} providerId
 */
export function resolveLlmApiKey(providerId) {
  const universal = process.env.LLM_API_KEY?.trim();
  if (universal) return universal;

  const preset = LLM_PROVIDER_PRESETS[providerId] ?? LLM_PROVIDER_PRESETS.custom;
  for (const envName of preset.apiKeyEnvVars) {
    const v = process.env[envName]?.trim();
    if (v) return v;
  }
  return '';
}

/**
 * @typedef {object} ResolvedLlmConfig
 * @property {LlmProviderId} provider
 * @property {string} providerLabel
 * @property {string} apiKey
 * @property {string} baseUrl
 * @property {string} model
 * @property {number} timeoutMs
 * @property {number} maxOutputTokens
 * @property {number} rateLimitRetries
 */

/**
 * Build runtime LLM config from environment.
 * @returns {ResolvedLlmConfig}
 */
export function resolveLlmConfig() {
  const provider = resolveLlmProviderId();
  const preset = LLM_PROVIDER_PRESETS[provider];

  const apiKey = resolveLlmApiKey(provider);
  const baseUrlRaw = process.env.LLM_BASE_URL?.trim();
  const baseUrl = (baseUrlRaw || preset.baseUrl || '').replace(/\/+$/, '');
  const model = process.env.LLM_MODEL?.trim() || preset.defaultModel;

  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || 60_000;
  const maxOutputTokens = Number(process.env.LLM_MAX_OUTPUT_TOKENS) || 1024;
  const rateLimitRetries = Number(process.env.LLM_RATE_LIMIT_RETRIES);
  const parsedRetries =
    Number.isFinite(rateLimitRetries) && rateLimitRetries >= 0
      ? Math.min(Math.floor(rateLimitRetries), 2)
      : 1;

  return {
    provider,
    providerLabel: preset.label,
    apiKey,
    baseUrl,
    model,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
    maxOutputTokens:
      Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
        ? Math.min(maxOutputTokens, 16_384)
        : 1024,
    /** One automatic retry on provider HTTP 429 (transient rate limit). Set LLM_RATE_LIMIT_RETRIES=0 to disable. */
    rateLimitRetries: parsedRetries,
  };
}

/**
 * @param {ResolvedLlmConfig} config
 */
export function validateLlmConfig(config) {
  const issues = [];
  if (!config.apiKey) {
    issues.push('Set LLM_API_KEY or a provider-specific key (e.g. GEMINI_API_KEY).');
  }
  if (!config.baseUrl) {
    issues.push('Set LLM_BASE_URL (required when LLM_PROVIDER=custom).');
  }
  if (!config.model) {
    issues.push('Set LLM_MODEL.');
  }
  return issues;
}

/**
 * @param {ResolvedLlmConfig} config
 */
export function isLlmConfigReady(config) {
  return validateLlmConfig(config).length === 0;
}
