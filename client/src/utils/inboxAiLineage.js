/**
 * Normalize text for comparing AI suggestion vs final composer draft.
 * @param {string} text
 */
export function normalizeAiTextForCompare(text) {
  if (typeof text !== 'string') return ''
  return text.trim().replace(/\s+/g, ' ')
}

/**
 * Last customer message id in thread (for suggest-reply parent linkage).
 * @param {Array<{ id?: string, sender_type?: string }>} messages
 * @returns {string | null}
 */
export function findLastCustomerMessageId(messages) {
  if (!Array.isArray(messages)) return null
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const row = messages[i]
    if (row?.sender_type === 'customer' && typeof row.id === 'string') {
      return row.id
    }
  }
  return null
}

/**
 * @param {string} sent
 * @param {string} source
 * @returns {'accepted' | 'edited'}
 */
export function inferSuggestFeedbackAction(sent, source) {
  return normalizeAiTextForCompare(sent) === normalizeAiTextForCompare(source)
    ? 'accepted'
    : 'edited'
}
