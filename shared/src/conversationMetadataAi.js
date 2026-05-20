/**
 * Shape of `conversations.metadata.ai` (written by `ai.classify_inbound`).
 * Phase 4 workflow conditions read these fields (intent, sentiment, auto_tags, etc.).
 */

import { isClassificationIntent, isClassificationSentiment } from './aiClassification.js';

/** @typedef {typeof CONVERSATION_METADATA_AI_KEYS[number]} ConversationMetadataAiKey */

export const CONVERSATION_METADATA_AI_KEYS = Object.freeze([
  'intent',
  'sentiment',
  'sentiment_score',
  'language',
  'auto_tags',
  'classified_at',
  'classified_message_id',
  'run_id',
]);

/**
 * Normalize `conversations.metadata` → `metadata.ai` for workflow conditions.
 *
 * @param {unknown} metadata — full `conversations.metadata` JSONB
 * @returns {{
 *   intent: string | null,
 *   sentiment: string | null,
 *   sentiment_score: number | null,
 *   language: string | null,
 *   auto_tags: string[],
 *   classified_at: string | null,
 *   classified_message_id: string | null,
 *   run_id: string | null,
 * } | null}
 */
export function parseConversationMetadataAi(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (metadata).ai;
  if (!raw || typeof raw !== 'object') return null;

  const src = /** @type {Record<string, unknown>} */ (raw);

  const intent =
    typeof src.intent === 'string' && isClassificationIntent(src.intent) ? src.intent : null;
  const sentiment =
    typeof src.sentiment === 'string' && isClassificationSentiment(src.sentiment)
      ? src.sentiment
      : null;

  const scoreRaw = src.sentiment_score ?? src.sentimentScore;
  const sentiment_score =
    typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)
      ? Math.max(-1, Math.min(1, scoreRaw))
      : null;

  const language =
    typeof src.language === 'string' && src.language.trim() ? src.language.trim().slice(0, 16) : null;

  const auto_tags = Array.isArray(src.auto_tags)
    ? src.auto_tags
        .filter((t) => typeof t === 'string' && t.trim())
        .map((t) => String(t).trim().toLowerCase())
        .slice(0, 10)
    : [];

  const classified_at =
    typeof src.classified_at === 'string' && src.classified_at.trim() ? src.classified_at : null;
  const classified_message_id =
    typeof src.classified_message_id === 'string' && src.classified_message_id.trim()
      ? src.classified_message_id
      : null;
  const run_id = typeof src.run_id === 'string' && src.run_id.trim() ? src.run_id : null;

  return {
    intent,
    sentiment,
    sentiment_score,
    language,
    auto_tags,
    classified_at,
    classified_message_id,
    run_id,
  };
}

/** @param {unknown} metadata */
export function hasConversationMetadataAi(metadata) {
  return parseConversationMetadataAi(metadata) !== null;
}
