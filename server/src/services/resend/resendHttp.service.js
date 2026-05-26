import { env } from '../../config/env.js';
import { HttpError } from '../../utils/httpError.js';

const RESEND_BASE = 'https://api.resend.com';

function platformApiKey() {
  const key = env.resendApiKey?.trim();
  if (!key) {
    throw new HttpError(503, 'Resend is not configured on this server (RESEND_API_KEY).');
  }
  return key;
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [options]
 */
export async function resendFetch(path, options = {}) {
  const method = options.method ?? 'GET';
  const headers = {
    Authorization: `Bearer ${platformApiKey()}`,
    'Content-Type': 'application/json',
  };

  const init = { method, headers };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${RESEND_BASE}${path}`, init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data?.message === 'string'
        ? data.message
        : typeof data?.error === 'string'
          ? data.error
          : 'Resend API error.';
    throw new HttpError(response.status >= 400 && response.status < 600 ? response.status : 502, message);
  }

  return data;
}
