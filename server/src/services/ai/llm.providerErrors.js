import { HttpError } from '../../utils/httpError.js';

/**
 * @param {Headers | Record<string, string> | undefined} headers
 * @returns {number | null} seconds
 */
export function parseRetryAfterSeconds(headers) {
  if (!headers) return null;

  let raw;
  if (typeof headers.get === 'function') {
    raw = headers.get('retry-after') ?? headers.get('Retry-After');
  } else {
    raw = headers['retry-after'] ?? headers['Retry-After'];
  }

  if (raw == null || raw === '') return null;

  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) {
    return Math.min(Math.ceil(asNum), 120);
  }

  const asDate = Date.parse(String(raw));
  if (Number.isFinite(asDate)) {
    const sec = Math.ceil((asDate - Date.now()) / 1000);
    return sec > 0 ? Math.min(sec, 120) : null;
  }

  return null;
}

/**
 * @param {Error & { status?: number, code?: string, message?: string, headers?: Headers }} e
 * @param {{ provider?: string, providerLabel?: string }} [context]
 */
export function mapLlmProviderError(e, context = {}) {
  const status = e?.status;
  const raw = e?.message || 'AI provider request failed.';
  const provider = context.provider ?? 'openai';
  const providerLabel = context.providerLabel ?? provider;

  if (status === 408 || e?.code === 'ETIMEDOUT' || raw.includes('timed out')) {
    const err = new HttpError(504, 'AI request timed out.');
    err.code = 'timeout';
    return err;
  }

  if (status === 401) {
    const err = new HttpError(
      503,
      'AI provider rejected the API key. Check LLM_API_KEY or your provider-specific key in server environment.',
    );
    err.code = 'provider_auth';
    return err;
  }

  if (status === 402) {
    const err = new HttpError(
      503,
      'AI provider billing is required. Add credits or a payment method for your LLM account.',
    );
    err.code = 'provider_billing';
    return err;
  }

  if (status === 429) {
    const quota =
      /quota|billing|insufficient|exceeded your current|resource_exhausted/i.test(raw) ||
      e?.code === 'insufficient_quota';

    const retryAfterSeconds = parseRetryAfterSeconds(e?.headers) ?? (quota ? 60 : 30);

    let message;
    if (quota) {
      message = `AI provider quota exceeded (${providerLabel}). Check billing and usage limits in your provider console.`;
    } else if (provider === 'gemini') {
      message =
        'Google Gemini rate limit reached. The free tier allows only a few requests per minute—wait about a minute, avoid rapid clicks, or enable billing in Google AI Studio.';
    } else {
      message = `AI provider rate limit exceeded (${providerLabel}). Wait a moment and try again.`;
    }

    const err = new HttpError(503, message);
    err.code = quota ? 'provider_quota' : 'provider_rate_limit';
    err.retryAfterSeconds = retryAfterSeconds;
    return err;
  }

  if (status && status >= 500) {
    const err = new HttpError(502, 'AI provider is temporarily unavailable.');
    err.code = 'provider_error';
    return err;
  }

  const err = new HttpError(502, 'AI provider request failed.');
  err.code = e?.code || 'provider_error';
  if (process.env.NODE_ENV !== 'production') {
    err.message = `${err.message} (${raw.slice(0, 200)})`;
  }
  return err;
}
