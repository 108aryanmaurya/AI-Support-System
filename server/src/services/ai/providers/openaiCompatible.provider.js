import OpenAI from 'openai';
import { HttpError } from '../../../utils/httpError.js';
import { mapLlmProviderError } from '../llm.providerErrors.js';

/** @type {Map<string, import('openai').OpenAI>} */
const clientCache = new Map();

/**
 * @param {import('../llm.config.js').ResolvedLlmConfig} config
 */
function cacheKey(config) {
  return `${config.provider}|${config.baseUrl}|${config.apiKey.slice(0, 8)}`;
}

/**
 * @param {import('../llm.config.js').ResolvedLlmConfig} config
 */
function getOpenAiSdkClient(config) {
  const key = cacheKey(config);
  let client = clientCache.get(key);
  if (!client) {
    client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      maxRetries: 0,
    });
    clientCache.set(key, client);
  }
  return client;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {import('../llm.config.js').ResolvedLlmConfig} config
 * @param {object} params
 * @param {Array<{ role: 'system' | 'user' | 'assistant', content: string }>} params.messages
 * @param {number} [params.maxTokens]
 * @param {number} [params.temperature]
 * @param {'text' | 'json'} [params.responseFormat]
 */
export async function chatCompletionOpenAiCompatible(
  config,
  { messages, maxTokens, temperature = 0.4, responseFormat = 'text' },
) {
  const client = getOpenAiSdkClient(config);
  const maxAttempts = 1 + Math.max(0, config.rateLimitRetries ?? 0);
  const ctx = { provider: config.provider, providerLabel: config.providerLabel };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const started = Date.now();

    try {
      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: maxTokens ?? config.maxOutputTokens,
        temperature,
        ...(responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      });

      const content = String(response.choices?.[0]?.message?.content ?? '').trim();
      if (!content) {
        throw new HttpError(502, 'AI provider returned an empty response.');
      }

      return {
        content,
        model: String(response.model || config.model),
        inputTokens: response.usage?.prompt_tokens ?? null,
        outputTokens: response.usage?.completion_tokens ?? null,
        latencyMs: Date.now() - started,
      };
    } catch (e) {
      if (e instanceof HttpError) throw e;

      const mapped = mapLlmProviderError(e, ctx);

      if (
        mapped.code === 'provider_rate_limit' &&
        attempt < maxAttempts - 1 &&
        (config.rateLimitRetries ?? 0) > 0
      ) {
        const waitSec = mapped.retryAfterSeconds ?? 3;
        const waitMs = Math.min(waitSec * 1000, 15_000);
        // eslint-disable-next-line no-console
        console.warn('[llm] provider rate limit; retrying', {
          provider: config.provider,
          attempt: attempt + 1,
          waitMs,
        });
        await sleep(waitMs);
        continue;
      }

      // eslint-disable-next-line no-console
      console.warn('[llm] provider request failed', {
        provider: config.provider,
        model: config.model,
        status: e?.status,
        code: mapped.code,
        message: String(e?.message ?? '').slice(0, 240),
      });

      throw mapped;
    }
  }

  throw new HttpError(502, 'AI provider request failed.');
}
