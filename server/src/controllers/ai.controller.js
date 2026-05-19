import { HttpError } from '../utils/httpError.js';
import { getLlmStatus, isLlmConfigured } from '../services/ai/llm.client.js';
import {
  runGenericAssist,
  runRewrite,
  runSuggestReply,
  runSummarize,
  runTranslate,
} from '../services/ai/assist.service.js';
import { recordAiFeedback } from '../services/ai/aiFeedback.service.js';
import { isAiStreamingEnabled } from '../services/ai/ai.streaming.js';

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.params?.orgId;
  if (!id) throw new HttpError(400, 'organizationId is required.');
  return id;
}

function actorUserIdOrThrow(req) {
  const id = req.userId ?? req.user?.id;
  if (!id) throw new HttpError(401, 'Authentication required.');
  return id;
}

function parseUuid(value, fieldName) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) throw new HttpError(400, `${fieldName} is required.`);
  return s;
}

export function aiHealth(req, res) {
  const organizationId = req.orgId ?? req.params?.orgId ?? null;
  const llm = getLlmStatus();
  res.json({
    ok: true,
    scope: 'ai',
    organizationId,
    llmConfigured: isLlmConfigured(),
    llmProvider: llm.provider,
    llmProviderLabel: llm.providerLabel,
    llmModel: llm.model,
    llmBaseUrlHost: llm.baseUrlHost,
    ...(llm.issues.length > 0 && process.env.NODE_ENV !== 'production'
      ? { llmConfigIssues: llm.issues }
      : {}),
  });
}

export async function aiAssist(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const conversationId =
      typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : null;
    const prompt = req.body?.prompt;

    const result = await runGenericAssist({
      organizationId,
      actorUserId,
      conversationId: conversationId || null,
      prompt,
    });

    res.json({
      message: result.text,
      runId: result.runId,
      model: result.model,
      latencyMs: result.latencyMs,
      usage: result.usage,
    });
  } catch (e) {
    next(e);
  }
}

export function aiSuggestReplyStream(req, res, next) {
  try {
    if (!isAiStreamingEnabled()) {
      throw new HttpError(
        501,
        'AI streaming is not enabled. Set AI_STREAMING_ENABLED=true when implemented (see docs/ai-features/ai-streaming.md).',
      );
    }
    throw new HttpError(501, 'AI streaming is not implemented yet.');
  } catch (e) {
    next(e);
  }
}

export async function aiSuggestReply(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const conversationId = parseUuid(req.body?.conversationId, 'conversationId');
    const useKnowledge = req.body?.useKnowledge !== false;
    const tone = req.body?.tone;
    const length = req.body?.length;

    const result = await runSuggestReply({
      organizationId,
      actorUserId,
      conversationId,
      useKnowledge,
      tone,
      length,
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function aiSummarize(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const conversationId = parseUuid(req.body?.conversationId, 'conversationId');
    const type = req.body?.type;

    const result = await runSummarize({
      organizationId,
      actorUserId,
      conversationId,
      type,
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function aiTranslate(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const text = req.body?.text;
    const targetLanguage = req.body?.targetLanguage;

    const result = await runTranslate({
      organizationId,
      actorUserId,
      text,
      targetLanguage,
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function aiRewrite(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const text = req.body?.text;
    const tone = req.body?.tone;

    const result = await runRewrite({
      organizationId,
      actorUserId,
      text,
      tone,
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function aiFeedback(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const aiRunId = req.body?.aiRunId ?? req.body?.ai_run_id;
    const messageId = req.body?.messageId ?? req.body?.message_id ?? null;
    const action = req.body?.action;
    const reason = req.body?.reason ?? null;

    const result = await recordAiFeedback({
      organizationId,
      actorUserId,
      aiRunId,
      messageId,
      action,
      reason,
    });

    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

/** Legacy global assist — requires organizationId in body. */
export async function aiAssistLegacy(req, res, next) {
  try {
    const organizationId =
      typeof req.body?.organizationId === 'string'
        ? req.body.organizationId.trim()
        : typeof req.body?.orgId === 'string'
          ? req.body.orgId.trim()
          : null;

    if (!organizationId) {
      throw new HttpError(
        400,
        'organizationId is required. Prefer POST /api/org/:orgId/ai/assist.',
      );
    }

    req.orgId = organizationId;
    return aiAssist(req, res, next);
  } catch (e) {
    next(e);
  }
}
