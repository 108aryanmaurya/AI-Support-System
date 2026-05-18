/** Redact common secrets before sending text to an LLM. */

const CREDIT_CARD_RE =
  /\b(?:\d[ -]*?){13,19}\b/g;

const API_KEY_RE =
  /\b(?:sk|pk|rk|api)[-_]?(?:live|test)?[-_]?[a-zA-Z0-9]{16,}\b/gi;

const BEARER_TOKEN_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi;

const PASSWORD_FIELD_RE =
  /(password|passwd|pwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*\S+/gi;

/**
 * @param {string} text
 * @returns {string}
 */
export function scrubPii(text) {
  if (typeof text !== 'string' || !text) return '';

  return text
    .replace(CREDIT_CARD_RE, '[REDACTED_CARD]')
    .replace(BEARER_TOKEN_RE, 'Bearer [REDACTED_TOKEN]')
    .replace(API_KEY_RE, '[REDACTED_API_KEY]')
    .replace(PASSWORD_FIELD_RE, '$1=[REDACTED]');
}
