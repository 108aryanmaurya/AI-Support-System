import { HttpError } from '../../utils/httpError.js';
import { assembleKnowledgeContext } from '../knowledge/contextAssembly.service.js';
import { retrieveKnowledge } from '../knowledge/retrieval.service.js';
import {
  normalizeSuggestLength,
  normalizeSuggestTone,
  normalizeSummaryType,
} from './ai.constants.js';
import { aiParseError } from './ai.errors.js';
import { assertAiAssistAllowed } from './aiGuards.service.js';
import { recordAiRun } from './aiRuns.service.js';
import {
  buildConversationPromptBlock,
  loadConversationTranscript,
  loadOrganizationPromptContext,
} from './conversationContext.service.js';
import { chatCompletion } from './llm.client.js';
import { hashPrompt } from './promptHash.js';
import { parseSuggestReplyResponse } from './parsers/suggestion.parser.js';
import { parseSummarizeResponse } from './parsers/summary.parser.js';
import { buildRewriteMessages } from './prompts/rewrite.js';
import { buildSuggestReplyMessages } from './prompts/suggestReply.js';
import { buildSummarizeMessages } from './prompts/summarize.js';
import { buildTranslateMessages } from './prompts/translate.js';
import { scrubPii } from './utils/piiFilter.js';

function mapRunStatus(error) {
  if (error?.code === 'timeout' || error?.status === 504) return 'timeout';
  if (error?.status === 403) return 'blocked_policy';
  if (error?.code === 'parse_failed') return 'error';
  return 'error';
}

function promptHashFromMessages(messages) {
  const promptText = messages.map((m) => `${m.role}: ${m.content}`).join('\n---\n');
  return hashPrompt(promptText);
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.actorUserId
 * @param {string} params.feature
 * @param {string | null} params.conversationId
 * @param {Array<{ role: string, content: string }>} params.messages
 * @param {string[] | null} [params.retrievalChunkIds]
 * @param {string} params.memberId
 */
async function runWithAiRunLogging({
  organizationId,
  actorUserId,
  feature,
  conversationId,
  messages,
  retrievalChunkIds = null,
  memberId,
}) {
  const promptHash = promptHashFromMessages(messages);

  try {
    const result = await chatCompletion({ messages });
    const run = await recordAiRun({
      organizationId,
      conversationId,
      triggeredByMemberId: memberId,
      feature,
      model: result.model,
      status: 'success',
      promptHash,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      retrievalChunkIds,
    });

    return {
      text: result.content,
      runId: run.id,
      model: result.model,
      latencyMs: result.latencyMs,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  } catch (e) {
    await recordAiRun({
      organizationId,
      conversationId,
      triggeredByMemberId: memberId,
      feature,
      model: 'unknown',
      status: mapRunStatus(e),
      promptHash,
      latencyMs: null,
      retrievalChunkIds,
      errorCode: e?.code || e?.message?.slice(0, 120) || 'error',
    });
    throw e;
  }
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.feature
 * @param {string | null} params.conversationId
 * @param {Array<{ role: string, content: string }>} params.messages
 * @param {string[] | null} [params.retrievalChunkIds]
 * @param {string} params.memberId
 * @param {(raw: string) => object} params.parse
 */
async function runStructuredWithAiRunLogging({
  organizationId,
  feature,
  conversationId,
  messages,
  retrievalChunkIds = null,
  memberId,
  parse,
}) {
  const promptHash = promptHashFromMessages(messages);

  try {
    const result = await chatCompletion({ messages, responseFormat: 'json' });

    let structured;
    try {
      structured = parse(result.content);
    } catch (parseErr) {
      await recordAiRun({
        organizationId,
        conversationId,
        triggeredByMemberId: memberId,
        feature,
        model: result.model,
        status: 'error',
        promptHash,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        retrievalChunkIds,
        errorCode: parseErr?.code || 'parse_failed',
      });
      throw parseErr instanceof HttpError ? parseErr : aiParseError();
    }

    const run = await recordAiRun({
      organizationId,
      conversationId,
      triggeredByMemberId: memberId,
      feature,
      model: result.model,
      status: 'success',
      promptHash,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      retrievalChunkIds,
    });

    return {
      ...structured,
      runId: run.id,
      model: result.model,
      latencyMs: result.latencyMs,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  } catch (e) {
    if (e?.code !== 'parse_failed' && !(e instanceof HttpError && e.status === 502)) {
      await recordAiRun({
        organizationId,
        conversationId,
        triggeredByMemberId: memberId,
        feature,
        model: 'unknown',
        status: mapRunStatus(e),
        promptHash,
        latencyMs: null,
        retrievalChunkIds,
        errorCode: e?.code || e?.message?.slice(0, 120) || 'error',
      });
    }
    throw e;
  }
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.actorUserId
 * @param {string | null} [params.conversationId]
 * @param {string} [params.prompt]
 */
export async function runGenericAssist({ organizationId, actorUserId, conversationId, prompt }) {
  const { member } = await assertAiAssistAllowed({
    organizationId,
    actorUserId,
    conversationId,
  });

  const userPrompt =
    typeof prompt === 'string' && prompt.trim()
      ? scrubPii(prompt.trim())
      : 'Say hello and confirm you are ready to help with support tasks.';

  const messages = [
    {
      role: 'system',
      content: 'You are a concise support copilot for customer service agents.',
    },
    { role: 'user', content: userPrompt },
  ];

  return runWithAiRunLogging({
    organizationId,
    actorUserId,
    feature: 'assist',
    conversationId: conversationId ?? null,
    messages,
    memberId: member.id,
  });
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.actorUserId
 * @param {string} params.conversationId
 * @param {boolean} [params.useKnowledge]
 * @param {string} [params.tone]
 * @param {string} [params.length]
 */
export async function runSuggestReply({
  organizationId,
  actorUserId,
  conversationId,
  useKnowledge = true,
  tone,
  length,
}) {
  const { member } = await assertAiAssistAllowed({
    organizationId,
    actorUserId,
    conversationId,
  });

  const [{ styleGuide }, transcriptCtx] = await Promise.all([
    loadOrganizationPromptContext(organizationId),
    loadConversationTranscript(organizationId, conversationId),
  ]);

  const { promptText } = buildConversationPromptBlock({
    messages: transcriptCtx.messages,
    conversation: transcriptCtx.conversation,
    customer: transcriptCtx.customer,
    tags: transcriptCtx.tags,
  });

  if (!promptText.trim()) {
    throw new HttpError(400, 'Conversation has no messages to suggest a reply from.');
  }

  const toneNorm = normalizeSuggestTone(tone);
  const lengthNorm = normalizeSuggestLength(length);

  let knowledgeContext = '';
  let retrievalChunkIds = null;

  if (useKnowledge) {
    const lastCustomer = [...transcriptCtx.messages].reverse().find((m) => m.role === 'customer');
    const query = lastCustomer?.content || transcriptCtx.messages.at(-1)?.content;
    if (query?.trim()) {
      const retrieval = await retrieveKnowledge({
        organizationId,
        query: query.trim(),
        mode: 'keyword',
        limit: 5,
        memberId: member.id,
      });
      if (retrieval.available && retrieval.results?.length) {
        const assembled = assembleKnowledgeContext({ chunks: retrieval.results, maxTokens: 2000 });
        knowledgeContext = scrubPii(assembled.text);
        retrievalChunkIds = retrieval.results.map((r) => r.chunkId).filter(Boolean);
      }
    }
  }

  const messages = buildSuggestReplyMessages({
    conversationBlock: promptText,
    knowledgeContext,
    styleGuide,
    tone: toneNorm,
    length: lengthNorm,
  });

  const result = await runStructuredWithAiRunLogging({
    organizationId,
    feature: 'suggest_reply',
    conversationId,
    messages,
    retrievalChunkIds,
    memberId: member.id,
    parse: parseSuggestReplyResponse,
  });

  return {
    reply: result.reply,
    confidence: result.confidence,
    detectedLanguage: result.detectedLanguage,
    suggestion: result.reply,
    tone: toneNorm,
    length: lengthNorm,
    runId: result.runId,
    model: result.model,
    latencyMs: result.latencyMs,
    usage: result.usage,
  };
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.actorUserId
 * @param {string} params.conversationId
 * @param {string} [params.type]
 */
export async function runSummarize({
  organizationId,
  actorUserId,
  conversationId,
  type,
}) {
  const { member } = await assertAiAssistAllowed({
    organizationId,
    actorUserId,
    conversationId,
  });

  const transcriptCtx = await loadConversationTranscript(organizationId, conversationId);
  const { promptText } = buildConversationPromptBlock({
    messages: transcriptCtx.messages,
    conversation: transcriptCtx.conversation,
    customer: transcriptCtx.customer,
    tags: transcriptCtx.tags,
  });

  if (!promptText.trim()) {
    throw new HttpError(400, 'Conversation has no messages to summarize.');
  }

  const summaryType = normalizeSummaryType(type);
  const messages = buildSummarizeMessages({ conversationBlock: promptText, type: summaryType });

  const result = await runStructuredWithAiRunLogging({
    organizationId,
    feature: 'summarize',
    conversationId,
    messages,
    memberId: member.id,
    parse: (raw) => parseSummarizeResponse(raw, summaryType),
  });

  return {
    summary: result.summary,
    type: summaryType,
    runId: result.runId,
    model: result.model,
    latencyMs: result.latencyMs,
    usage: result.usage,
  };
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.actorUserId
 * @param {string} params.text
 * @param {string} [params.targetLanguage]
 */
export async function runTranslate({
  organizationId,
  actorUserId,
  text,
  targetLanguage = 'English',
}) {
  const trimmed = scrubPii(typeof text === 'string' ? text.trim() : '');
  if (!trimmed) {
    throw new HttpError(400, 'text is required.');
  }

  const { member } = await assertAiAssistAllowed({ organizationId, actorUserId });

  const lang =
    typeof targetLanguage === 'string' && targetLanguage.trim()
      ? targetLanguage.trim()
      : 'English';

  const messages = buildTranslateMessages({ text: trimmed, targetLanguage: lang });

  const result = await runWithAiRunLogging({
    organizationId,
    actorUserId,
    feature: 'translate',
    conversationId: null,
    messages,
    memberId: member.id,
  });

  return { ...result, translation: result.text };
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.actorUserId
 * @param {string} params.text
 * @param {string} [params.tone]
 */
export async function runRewrite({
  organizationId,
  actorUserId,
  text,
  tone = 'professional',
}) {
  const trimmed = scrubPii(typeof text === 'string' ? text.trim() : '');
  if (!trimmed) {
    throw new HttpError(400, 'text is required.');
  }

  const { member } = await assertAiAssistAllowed({ organizationId, actorUserId });

  const toneStr =
    typeof tone === 'string' && tone.trim() ? tone.trim().slice(0, 64) : 'professional';

  const messages = buildRewriteMessages({ text: trimmed, tone: toneStr });

  const result = await runWithAiRunLogging({
    organizationId,
    actorUserId,
    feature: 'rewrite',
    conversationId: null,
    messages,
    memberId: member.id,
  });

  return { ...result, rewritten: result.text };
}
