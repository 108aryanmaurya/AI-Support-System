import { aiParseError, AI_ERROR_CODES } from '../ai.errors.js';

/**
 * @param {string} raw
 * @returns {{ reply: string, confidence: number | null, detectedLanguage: string | null }}
 */
export function parseSuggestReplyResponse(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw aiParseError('Suggest-reply response was not valid JSON.', AI_ERROR_CODES.PARSE_FAILED);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw aiParseError('Suggest-reply response must be a JSON object.', AI_ERROR_CODES.PARSE_FAILED);
  }

  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
  if (!reply) {
    throw aiParseError('Suggest-reply response missing reply field.', AI_ERROR_CODES.PARSE_FAILED);
  }

  let confidence = null;
  if (parsed.confidence != null) {
    const n = Number(parsed.confidence);
    if (Number.isFinite(n)) confidence = Math.min(1, Math.max(0, n));
  }

  const detectedLanguage =
    typeof parsed.detected_language === 'string' && parsed.detected_language.trim()
      ? parsed.detected_language.trim().slice(0, 16)
      : typeof parsed.detectedLanguage === 'string' && parsed.detectedLanguage.trim()
        ? parsed.detectedLanguage.trim().slice(0, 16)
        : null;

  return { reply, confidence, detectedLanguage };
}
