import { HttpError } from '../../utils/httpError.js';
import { normalizeSuggestLength, normalizeSuggestTone } from './ai.constants.js';
import { assertAiAssistAllowed } from './aiGuards.service.js';
import {
  buildConversationPromptBlock,
  loadConversationTranscript,
  loadOrganizationPromptContext,
} from './conversationContext.service.js';
import { loadKnowledgeContextForAssist } from './context/knowledgeContext.js';
import { parseSuggestReplyResponse } from './parsers/suggestion.parser.js';
import { buildRewriteMessages } from './prompts/rewrite.js';
import { buildSuggestReplyMessages } from './prompts/suggestReply.js';
import { buildTranslateMessages } from './prompts/translate.js';
import { scrubPii } from './utils/piiFilter.js';
import { wrapUntrustedContext } from './utils/promptInjection.js';
import {
  runStructuredWithAiRunLogging,
  runWithAiRunLogging,
} from './assistRunLogging.service.js';

export { runSummarize } from './summary.service.js';

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
      content:
        'You are a concise support copilot for customer service agents. Never claim to be the company or promise refunds.',
    },
    {
      role: 'user',
      content: wrapUntrustedContext('agent_prompt', userPrompt),
    },
  ];

  return runWithAiRunLogging({
    organizationId,
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
      const kb = await loadKnowledgeContextForAssist({
        organizationId,
        query: query.trim(),
        memberId: member.id,
      });
      knowledgeContext = kb.text;
      retrievalChunkIds = kb.chunkIds;
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
    outputTextExtractor: (structured) =>
      typeof structured?.reply === 'string' ? structured.reply : '',
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
    feature: 'rewrite',
    conversationId: null,
    messages,
    memberId: member.id,
  });

  return { ...result, rewritten: result.text };
}
