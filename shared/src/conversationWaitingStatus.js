/**
 * Who must act next — orthogonal to `conversations.status` (open, resolved, etc.).
 */

export const CONVERSATION_WAITING_STATUS_NONE = '';

export const CONVERSATION_WAITING_STATUSES = Object.freeze([
  CONVERSATION_WAITING_STATUS_NONE,
  'waiting_agent',
  'waiting_customer',
]);

/** @param {unknown} v */
export function isConversationWaitingStatus(v) {
  return typeof v === 'string' && CONVERSATION_WAITING_STATUSES.includes(v);
}

/**
 * @param {unknown} v
 * @returns {typeof CONVERSATION_WAITING_STATUSES[number]}
 */
export function normalizeConversationWaitingStatus(v) {
  if (v === null || v === undefined || v === '') return CONVERSATION_WAITING_STATUS_NONE;
  const s = typeof v === 'string' ? v.trim() : '';
  return isConversationWaitingStatus(s) ? s : CONVERSATION_WAITING_STATUS_NONE;
}

/**
 * @param {unknown} conversation
 * @returns {typeof CONVERSATION_WAITING_STATUSES[number]}
 */
export function getConversationWaitingStatus(conversation) {
  if (!conversation || typeof conversation !== 'object') {
    return CONVERSATION_WAITING_STATUS_NONE;
  }
  const row = /** @type {Record<string, unknown>} */ (conversation);
  return normalizeConversationWaitingStatus(row.waiting_status);
}
