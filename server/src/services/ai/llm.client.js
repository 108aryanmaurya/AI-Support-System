import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { HttpError } from '../../utils/httpError.js';

let cachedClient = null;

export function isLlmConfigured() {
  return Boolean(env.llmApiKey);
}

function getClient() {
  if (!isLlmConfigured()) return null;
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: env.llmApiKey,
      baseURL: env.llmBaseUrl.replace(/\/+$/, ''),
      timeout: env.llmTimeoutMs,
      maxRetries: 0,
    });
  }
  return cachedClient;
}

/**
 * OpenAI-compatible chat completion.
 *
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
  const client = getClient();
  if (!client) {
    throw new HttpError(
      503,
      'AI provider is not configured. Set LLM_API_KEY in server environment.',
    );
  }

  const started = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: env.llmModel,
      messages,
      max_tokens: maxTokens ?? env.llmMaxOutputTokens,
      temperature,
      ...(responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
    });

    const content = String(response.choices?.[0]?.message?.content ?? '').trim();
    if (!content) {
      throw new HttpError(502, 'AI provider returned an empty response.');
    }

    return {
      content,
      model: String(response.model || env.llmModel),
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: response.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    if (e instanceof HttpError) throw e;

    const status = e?.status;
    if (status === 408 || e?.code === 'ETIMEDOUT' || e?.message?.includes('timed out')) {
      const err = new HttpError(504, 'AI request timed out.');
      err.code = 'timeout';
      throw err;
    }

    const msg = e?.message || 'AI provider request failed.';
    const err = new HttpError(status && status >= 500 ? 502 : 400, msg);
    err.code = e?.code || 'provider_error';
    throw err;
  }
}
