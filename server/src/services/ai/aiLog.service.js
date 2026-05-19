/**
 * Structured JSON logs for AI failures (ops / log aggregation).
 * Never log raw prompts, API keys, or message bodies.
 */

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.feature
 * @param {string | null} [params.runId]
 * @param {string | null} [params.conversationId]
 * @param {string | null} [params.errorCode]
 * @param {string} [params.message]
 * @param {number} [params.httpStatus]
 */
export function logAiFailure({
  organizationId,
  feature,
  runId = null,
  conversationId = null,
  errorCode = null,
  message = '',
  httpStatus = null,
}) {
  const payload = {
    event: 'ai.failure',
    organization_id: organizationId,
    feature,
    ...(runId ? { run_id: runId } : {}),
    ...(conversationId ? { conversation_id: conversationId } : {}),
    ...(errorCode ? { error_code: String(errorCode).slice(0, 120) } : {}),
    ...(httpStatus != null ? { http_status: httpStatus } : {}),
    ...(message ? { message: String(message).slice(0, 200) } : {}),
  };

  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
}
