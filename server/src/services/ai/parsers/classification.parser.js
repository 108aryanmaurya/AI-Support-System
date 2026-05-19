import { isClassificationIntent, isClassificationSentiment } from '@ai-support/shared';
import { aiParseError, AI_ERROR_CODES } from '../ai.errors.js';

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function toAutoTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v !== 'string') return '';
      return v
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 48);
    })
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * @param {string} raw
 */
export function parseClassificationResponse(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw aiParseError(
      'Classification response was not valid JSON.',
      AI_ERROR_CODES.PARSE_FAILED,
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw aiParseError(
      'Classification response must be a JSON object.',
      AI_ERROR_CODES.PARSE_FAILED,
    );
  }

  const intentRaw = typeof parsed.intent === 'string' ? parsed.intent.trim() : '';
  let intent = intentRaw
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!isClassificationIntent(intent)) {
    intent = 'other';
  }

  const sentimentRaw =
    typeof parsed.sentiment === 'string' ? parsed.sentiment.trim().toLowerCase() : '';
  const sentiment = isClassificationSentiment(sentimentRaw) ? sentimentRaw : 'neutral';

  let sentimentScore = Number(parsed.sentiment_score ?? parsed.score);
  if (!Number.isFinite(sentimentScore)) sentimentScore = 0.5;
  sentimentScore = Math.min(1, Math.max(0, sentimentScore));

  const language =
    typeof parsed.language === 'string' && parsed.language.trim()
      ? parsed.language.trim().toLowerCase().slice(0, 8)
      : 'unknown';

  const autoTags = toAutoTags(parsed.auto_tags ?? parsed.autoTags);

  return {
    intent,
    sentiment,
    sentiment_score: sentimentScore,
    language,
    auto_tags: autoTags,
  };
}
