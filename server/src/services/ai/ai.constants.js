/** Suggest-reply tone options (request body). */
export const SUGGEST_REPLY_TONES = Object.freeze([
  'professional',
  'friendly',
  'empathetic',
  'concise',
]);

/** Suggest-reply length options (request body). */
export const SUGGEST_REPLY_LENGTHS = Object.freeze(['short', 'medium', 'long']);

/** Summarize output modes (request body). */
export const SUMMARY_TYPES = Object.freeze(['short', 'detailed', 'timeline']);

const TONE_SET = new Set(SUGGEST_REPLY_TONES);
const LENGTH_SET = new Set(SUGGEST_REPLY_LENGTHS);
const SUMMARY_TYPE_SET = new Set(SUMMARY_TYPES);

/** @param {unknown} value @param {string} [fallback] */
export function normalizeSuggestTone(value, fallback = 'professional') {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return TONE_SET.has(s) ? s : fallback;
}

/** @param {unknown} value @param {string} [fallback] */
export function normalizeSuggestLength(value, fallback = 'medium') {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return LENGTH_SET.has(s) ? s : fallback;
}

/** @param {unknown} value @param {string} [fallback] */
export function normalizeSummaryType(value, fallback = 'detailed') {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SUMMARY_TYPE_SET.has(s) ? s : fallback;
}
