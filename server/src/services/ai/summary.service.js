import { HttpError } from '../../utils/httpError.js';
import { assertAiAssistAllowed } from './aiGuards.service.js';
import {
  buildConversationPromptBlock,
  loadConversationTranscript,
} from './conversationContext.service.js';
import { normalizeSummaryType } from './ai.constants.js';
import { buildSummarizeMessages } from './prompts/summarize.js';
import { parseSummarizeResponse } from './parsers/summary.parser.js';
import { runStructuredWithAiRunLogging } from './assistRunLogging.service.js';

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
    outputTextExtractor: (structured) => {
      const s = structured?.summary;
      if (!s || typeof s !== 'object') return '';
      if (Array.isArray(s.events)) {
        return s.events.map((e) => e?.what).filter(Boolean).join(' ');
      }
      return [s.issue, s.current_status, ...(s.actions_taken ?? [])].filter(Boolean).join(' ');
    },
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
