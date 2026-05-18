import { supabaseAdmin } from '../../config/supabase.js';

function isMissingAiRunsTable(error) {
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.message?.includes('ai_runs')
  );
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string | null} [params.conversationId]
 * @param {string | null} [params.messageId]
 * @param {string | null} [params.triggeredByMemberId]
 * @param {string} params.feature
 * @param {string} params.model
 * @param {'success' | 'error' | 'timeout' | 'blocked_policy'} params.status
 * @param {string | null} [params.promptHash]
 * @param {number | null} [params.inputTokens]
 * @param {number | null} [params.outputTokens]
 * @param {number | null} [params.latencyMs]
 * @param {string[] | null} [params.retrievalChunkIds]
 * @param {string | null} [params.errorCode]
 */
export async function recordAiRun(params) {
  const row = {
    organization_id: params.organizationId,
    conversation_id: params.conversationId ?? null,
    message_id: params.messageId ?? null,
    triggered_by_member_id: params.triggeredByMemberId ?? null,
    feature: params.feature,
    model: params.model?.slice(0, 200) || 'unknown',
    status: params.status,
    prompt_hash: params.promptHash ?? null,
    input_tokens: params.inputTokens ?? null,
    output_tokens: params.outputTokens ?? null,
    latency_ms: params.latencyMs ?? null,
    retrieval_chunk_ids:
      params.retrievalChunkIds?.length > 0 ? params.retrievalChunkIds : null,
    error_code: params.errorCode?.slice(0, 120) ?? null,
  };

  const { data, error } = await supabaseAdmin.from('ai_runs').insert(row).select('id').single();

  if (error) {
    if (isMissingAiRunsTable(error)) {
      console.warn('[ai_runs] table unavailable; skip logging', { feature: params.feature });
      return { id: null, skipped: true };
    }
    console.error('[ai_runs] insert failed', {
      feature: params.feature,
      organizationId: params.organizationId,
      message: error.message,
    });
    return { id: null, skipped: true };
  }

  return { id: data?.id ?? null, skipped: false };
}
