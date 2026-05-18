/** Request/response contracts for Phase 3 copilot APIs. */

export const SUGGEST_REPLY_TONES = Object.freeze([
  'professional',
  'friendly',
  'empathetic',
  'concise',
]);

export const SUGGEST_REPLY_LENGTHS = Object.freeze(['short', 'medium', 'long']);

export const SUMMARY_TYPES = Object.freeze(['short', 'detailed', 'timeline']);

/**
 * @typedef {object} AiSuggestReplyResponse
 * @property {string} reply
 * @property {number | null} confidence
 * @property {string | null} detectedLanguage
 * @property {string} suggestion - alias of reply for older clients
 * @property {string} runId
 * @property {string} model
 * @property {number} latencyMs
 */

/**
 * @typedef {object} AiSummarizeShortSummary
 * @property {string} issue
 * @property {string} current_status
 */

/**
 * @typedef {object} AiSummarizeDetailedSummary
 * @property {string} issue
 * @property {string[]} actions_taken
 * @property {string} current_status
 */

/**
 * @typedef {object} AiSummarizeTimelineEvent
 * @property {string} when
 * @property {string} what
 */

/**
 * @typedef {object} AiSummarizeResponse
 * @property {'short' | 'detailed' | 'timeline'} type
 * @property {AiSummarizeShortSummary | AiSummarizeDetailedSummary | { events: AiSummarizeTimelineEvent[] }} summary
 * @property {string} runId
 * @property {string} model
 * @property {number} latencyMs
 */
