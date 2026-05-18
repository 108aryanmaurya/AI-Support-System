import { env } from '../../../config/env.js';

/** Approximate max characters for conversation context in prompts. */
export const DEFAULT_MAX_PROMPT_CHARS = env.llmMaxPromptChars;

/**
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
export function truncateText(text, maxChars) {
  if (typeof text !== 'string') return '';
  if (!Number.isFinite(maxChars) || maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Keep the most recent messages that fit within a character budget.
 * @param {Array<{ role: string, content: string }>} messages
 * @param {number} [maxChars]
 */
export function truncateConversation(messages, maxChars = DEFAULT_MAX_PROMPT_CHARS) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: [], droppedCount: 0, truncated: false };
  }

  const budget = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : DEFAULT_MAX_PROMPT_CHARS;
  const kept = [];
  let used = 0;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    const line = `${m.role}: ${m.content ?? ''}\n`;
    if (kept.length > 0 && used + line.length > budget) break;
    kept.unshift(m);
    used += line.length;
  }

  const droppedCount = messages.length - kept.length;
  return {
    messages: kept,
    droppedCount,
    truncated: droppedCount > 0,
  };
}
