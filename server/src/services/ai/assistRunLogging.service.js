import { HttpError } from '../../utils/httpError.js';
import { AI_ERROR_CODES } from './ai.errors.js';
import { aiParseError } from './ai.errors.js';
import { policyBlockedError, scanOutputPolicy } from './ai.guardrails.js';
import { recordAiRun } from './aiRuns.service.js';
import { chatCompletion } from './llm.client.js';
import { hashPrompt } from './promptHash.js';
import { logAiFailure } from './aiLog.service.js';

export function mapRunStatus(error) {
  if (error?.code === AI_ERROR_CODES.POLICY_BLOCKED || error?.status === 403) {
    return 'blocked_policy';
  }
  if (error?.code === 'timeout' || error?.status === 504) return 'timeout';
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
 * @param {string | null} params.conversationId
 * @param {string} params.feature
 * @param {string} params.memberId
 * @param {string} params.promptHash
 * @param {string} params.model
 * @param {string} params.outputText
 * @param {string[] | null} [params.retrievalChunkIds]
 * @param {number | null} [params.inputTokens]
 * @param {number | null} [params.outputTokens]
 * @param {number | null} [params.latencyMs]
 */
async function recordPolicyBlockedRun({
  organizationId,
  conversationId,
  feature,
  memberId,
  promptHash,
  model,
  outputText,
  retrievalChunkIds,
  inputTokens,
  outputTokens,
  latencyMs,
  violations,
}) {
  const run = await recordAiRun({
    organizationId,
    conversationId,
    triggeredByMemberId: memberId,
    feature,
    model,
    status: 'blocked_policy',
    promptHash,
    inputTokens: inputTokens ?? null,
    outputTokens: outputTokens ?? null,
    latencyMs: latencyMs ?? null,
    retrievalChunkIds,
    errorCode: violations.join(','),
  });

  logAiFailure({
    organizationId,
    feature,
    runId: run.id,
    conversationId,
    errorCode: AI_ERROR_CODES.POLICY_BLOCKED,
    message: `policy: ${violations.join(',')}`,
    httpStatus: 403,
  });

  throw policyBlockedError(violations);
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.feature
 * @param {string | null} params.conversationId
 * @param {Array<{ role: string, content: string }>} params.messages
 * @param {string[] | null} [params.retrievalChunkIds]
 * @param {string} params.memberId
 * @param {boolean} [params.enforcePolicy]
 */
export async function runWithAiRunLogging({
  organizationId,
  feature,
  conversationId,
  messages,
  retrievalChunkIds = null,
  memberId,
  enforcePolicy = true,
}) {
  const promptHash = promptHashFromMessages(messages);

  try {
    const result = await chatCompletion({ messages });

    if (enforcePolicy) {
      const policy = scanOutputPolicy(result.content);
      if (policy.blocked) {
        await recordPolicyBlockedRun({
          organizationId,
          conversationId,
          feature,
          memberId,
          promptHash,
          model: result.model,
          outputText: result.content,
          retrievalChunkIds,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          violations: policy.violations,
        });
      }
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
    if (e?.code === AI_ERROR_CODES.POLICY_BLOCKED) throw e;

    const run = await recordAiRun({
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
    logAiFailure({
      organizationId,
      feature,
      runId: run.id,
      conversationId,
      errorCode: e?.code || 'error',
      message: e?.message,
      httpStatus: e?.status,
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
 * @param {(structured: object) => string} [params.outputTextExtractor]
 * @param {boolean} [params.enforcePolicy]
 */
export async function runStructuredWithAiRunLogging({
  organizationId,
  feature,
  conversationId,
  messages,
  retrievalChunkIds = null,
  memberId,
  parse,
  outputTextExtractor = null,
  enforcePolicy = true,
}) {
  const promptHash = promptHashFromMessages(messages);

  try {
    const result = await chatCompletion({ messages, responseFormat: 'json' });

    let structured;
    try {
      structured = parse(result.content);
    } catch (parseErr) {
      const run = await recordAiRun({
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
      logAiFailure({
        organizationId,
        feature,
        runId: run.id,
        conversationId,
        errorCode: parseErr?.code || 'parse_failed',
        message: parseErr?.message,
        httpStatus: parseErr?.status,
      });
      throw parseErr instanceof HttpError ? parseErr : aiParseError();
    }

    if (enforcePolicy) {
      const textForPolicy =
        typeof outputTextExtractor === 'function'
          ? outputTextExtractor(structured)
          : typeof structured?.reply === 'string'
            ? structured.reply
            : result.content;

      const policy = scanOutputPolicy(textForPolicy);
      if (policy.blocked) {
        await recordPolicyBlockedRun({
          organizationId,
          conversationId,
          feature,
          memberId,
          promptHash,
          model: result.model,
          outputText: textForPolicy,
          retrievalChunkIds,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          violations: policy.violations,
        });
      }
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
    if (e?.code === AI_ERROR_CODES.POLICY_BLOCKED) throw e;

    if (e?.code !== 'parse_failed' && !(e instanceof HttpError && e.status === 502)) {
      const run = await recordAiRun({
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
      logAiFailure({
        organizationId,
        feature,
        runId: run.id,
        conversationId,
        errorCode: e?.code || 'error',
        message: e?.message,
        httpStatus: e?.status,
      });
    }
    throw e;
  }
}
