import { HttpError } from '../../utils/httpError.js';

export const AI_ERROR_CODES = Object.freeze({
  PROVIDER_NOT_CONFIGURED: 'provider_not_configured',
  PROVIDER_ERROR: 'provider_error',
  TIMEOUT: 'timeout',
  PARSE_FAILED: 'parse_failed',
  EMPTY_RESPONSE: 'empty_response',
  POLICY_BLOCKED: 'blocked_policy',
});

/**
 * @param {string} [message]
 * @param {string} [code]
 */
export function aiParseError(
  message = 'AI response could not be parsed.',
  code = AI_ERROR_CODES.PARSE_FAILED,
) {
  const err = new HttpError(502, message);
  err.code = code;
  return err;
}

/**
 * Map provider / internal errors to stable client messages.
 * @param {Error & { status?: number, code?: string }} error
 */
export function mapAiErrorForClient(error) {
  if (error instanceof HttpError) return error;

  const err = new HttpError(502, 'AI request failed.');
  err.code = AI_ERROR_CODES.PROVIDER_ERROR;
  return err;
}
