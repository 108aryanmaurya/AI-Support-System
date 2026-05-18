/** Values for `ai_runs.feature` (Phase 3+). */
export const AI_FEATURES = Object.freeze([
  'assist',
  'suggest_reply',
  'summarize',
  'translate',
  'rewrite',
  'classify',
  'rag_ask',
  'auto_reply',
]);

/** @param {unknown} v */
export function isAiFeature(v) {
  return typeof v === 'string' && AI_FEATURES.includes(v);
}
