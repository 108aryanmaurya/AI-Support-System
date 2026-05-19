import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { getOrgAiSettings, isOrgAiMasterEnabled } from '../orgSettings.service.js';
import { listTagDefinitions, mergeConversationTagsByIds } from '../tags.service.js';
import { loadConversationTranscript, buildConversationPromptBlock } from './conversationContext.service.js';
import { buildClassifyMessages } from './prompts/classify.js';
import { parseClassificationResponse } from './parsers/classification.parser.js';
import { chatCompletion } from './llm.client.js';
import { isLlmConfigured } from './llm.client.js';
import { recordAiRun } from './aiRuns.service.js';
import { hashPrompt } from './promptHash.js';
import { AI_ERROR_CODES } from './ai.errors.js';
import { logAiFailure } from './aiLog.service.js';
import { scrubPii } from './utils/piiFilter.js';
import { wrapUntrustedContext } from './utils/promptInjection.js';

function mapRunStatus(error) {
  if (error?.code === 'timeout' || error?.status === 504) return 'timeout';
  if (error?.status === 403) return 'blocked_policy';
  return 'error';
}

function promptHashFromMessages(messages) {
  const promptText = messages.map((m) => `${m.role}: ${m.content}`).join('\n---\n');
  return hashPrompt(promptText);
}

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {string} name
 */
function normalizeTagName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

/**
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {string[]} autoTagNames
 */
async function applyMatchingOrgTags({ organizationId, conversationId, autoTagNames }) {
  if (!autoTagNames.length) return { applied: [] };

  let defs;
  try {
    ({ tags: defs } = await listTagDefinitions(organizationId));
  } catch (e) {
    if (e?.status === 503) return { applied: [] };
    throw e;
  }

  const wanted = new Set(autoTagNames.map(normalizeTagName).filter(Boolean));
  const matchedIds = [];
  const applied = [];

  for (const def of defs ?? []) {
    const key = normalizeTagName(def.name);
    if (wanted.has(key)) {
      matchedIds.push(def.id);
      applied.push(def.name);
    }
  }

  if (matchedIds.length === 0) return { applied: [] };

  await mergeConversationTagsByIds({
    organizationId,
    conversationId,
    tagIdsToAdd: matchedIds,
  });

  return { applied };
}

/**
 * Merge classification into conversations.metadata.ai (preserves other metadata keys).
 */
async function persistClassificationMetadata({
  organizationId,
  conversationId,
  classification,
  messageId,
  runId,
}) {
  const { data: conv, error: loadErr } = await supabaseAdmin
    .from('conversations')
    .select('id, metadata')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (loadErr) {
    throw new HttpError(500, loadErr.message || 'Failed to load conversation for classification.');
  }
  if (!conv) {
    throw new HttpError(404, 'Conversation not found in this organization.');
  }

  const prior =
    conv.metadata && typeof conv.metadata === 'object' ? { ...conv.metadata } : {};

  prior.ai = {
    intent: classification.intent,
    sentiment: classification.sentiment,
    sentiment_score: classification.sentiment_score,
    language: classification.language,
    auto_tags: classification.auto_tags,
    classified_at: new Date().toISOString(),
    classified_message_id: messageId,
    run_id: runId,
  };

  const { error: updErr } = await supabaseAdmin
    .from('conversations')
    .update({ metadata: prior })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (updErr) {
    throw new HttpError(500, updErr.message || 'Failed to save classification metadata.');
  }
}

/**
 * Run LLM classification for a customer inbound message (worker / inline automation).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.messageId
 */
export async function runInboundClassification({
  organizationId,
  conversationId,
  messageId,
}) {
  if (!organizationId || !conversationId || !messageId) {
    throw new HttpError(400, 'organizationId, conversationId, and messageId are required.');
  }

  if (!isLlmConfigured()) {
    // eslint-disable-next-line no-console
    console.warn('[classification] skipped: LLM not configured', { organizationId });
    return { skipped: true, reason: 'llm_not_configured' };
  }

  if (!(await isOrgAiMasterEnabled(organizationId))) {
    return { skipped: true, reason: 'ai_disabled' };
  }

  const aiSettings = await getOrgAiSettings(organizationId);

  const { data: conv, error: convErr } = await supabaseAdmin
    .from('conversations')
    .select('id, ai_enabled')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (convErr) {
    throw new HttpError(500, convErr.message || 'Failed to load conversation.');
  }
  if (!conv) {
    throw new HttpError(404, 'Conversation not found.');
  }
  if (conv.ai_enabled === false) {
    return { skipped: true, reason: 'conversation_ai_disabled' };
  }

  const { data: msg, error: msgErr } = await supabaseAdmin
    .from('messages')
    .select('id, sender_type, content')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (msgErr) {
    throw new HttpError(500, msgErr.message || 'Failed to load message.');
  }
  if (!msg) {
    throw new HttpError(404, 'Message not found.');
  }
  if (msg.sender_type !== 'customer') {
    return { skipped: true, reason: 'not_customer_message' };
  }

  const latestCustomerMessage = String(msg.content ?? '').trim();
  if (!latestCustomerMessage) {
    return { skipped: true, reason: 'empty_message' };
  }

  const transcriptCtx = await loadConversationTranscript(organizationId, conversationId);
  const { promptText } = buildConversationPromptBlock({
    messages: transcriptCtx.messages,
    conversation: transcriptCtx.conversation,
    customer: transcriptCtx.customer,
    tags: transcriptCtx.tags,
  });

  const customerBlock = wrapUntrustedContext(
    'latest_customer_message',
    scrubPii(latestCustomerMessage),
  );

  let orgTagNames = [];
  try {
    const { tags: defs } = await listTagDefinitions(organizationId);
    orgTagNames = (defs ?? []).map((t) => t.name).filter(Boolean).slice(0, 64);
  } catch {
    orgTagNames = [];
  }

  const messages = buildClassifyMessages({
    conversationBlock: promptText,
    latestCustomerMessage: customerBlock,
    orgTagNames,
  });

  const promptHash = promptHashFromMessages(messages);
  const feature = 'classify';

  try {
    const result = await chatCompletion({ messages, responseFormat: 'json' });

    let classification;
    try {
      classification = parseClassificationResponse(result.content);
    } catch (parseErr) {
      const run = await recordAiRun({
        organizationId,
        conversationId,
        triggeredByMemberId: null,
        feature,
        model: result.model,
        status: 'error',
        promptHash,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        errorCode: parseErr?.code || AI_ERROR_CODES.PARSE_FAILED,
      });
      logAiFailure({
        organizationId,
        feature,
        runId: run.id,
        conversationId,
        errorCode: parseErr?.code || AI_ERROR_CODES.PARSE_FAILED,
        message: parseErr?.message,
      });
      throw parseErr;
    }

    const run = await recordAiRun({
      organizationId,
      conversationId,
      triggeredByMemberId: null,
      feature,
      model: result.model,
      status: 'success',
      promptHash,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
    });

    await persistClassificationMetadata({
      organizationId,
      conversationId,
      classification,
      messageId,
      runId: run.id,
    });

    let appliedTags = [];
    if (aiSettings.auto_tag_enabled && classification.auto_tags.length > 0) {
      const applied = await applyMatchingOrgTags({
        organizationId,
        conversationId,
        autoTagNames: classification.auto_tags,
      });
      appliedTags = applied.applied;
    }

    return {
      skipped: false,
      classification,
      runId: run.id,
      appliedTags,
    };
  } catch (e) {
    if (!(e instanceof HttpError) || e.status >= 500) {
      const run = await recordAiRun({
        organizationId,
        conversationId,
        triggeredByMemberId: null,
        feature,
        model: 'unknown',
        status: mapRunStatus(e),
        promptHash,
        errorCode: e?.code || e?.message?.slice(0, 120) || 'error',
      }).catch(() => ({ id: null }));
      logAiFailure({
        organizationId,
        feature,
        runId: run?.id ?? null,
        conversationId,
        errorCode: e?.code || 'error',
        message: e?.message,
        httpStatus: e?.status,
      });
    }
    throw e;
  }
}

/**
 * @param {string} organizationId
 * @param {string} conversationId
 */
export async function canEnqueueInboundClassification(organizationId, conversationId) {
  if (!UUID_V4_REGEX.test(organizationId) || !UUID_V4_REGEX.test(conversationId)) {
    return false;
  }
  if (!isLlmConfigured()) return false;
  if (!(await isOrgAiMasterEnabled(organizationId))) return false;

  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('ai_enabled')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  return conv?.ai_enabled !== false;
}
