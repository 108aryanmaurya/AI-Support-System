/** Allowed values for LLM conversation classification (Phase 3 Sprint 4). */

export const CLASSIFICATION_INTENTS = Object.freeze([
  'general_inquiry',
  'billing_issue',
  'refund_request',
  'shipping_delivery',
  'technical_support',
  'account_access',
  'product_question',
  'complaint',
  'feedback',
  'other',
]);

export const CLASSIFICATION_SENTIMENTS = Object.freeze([
  'positive',
  'neutral',
  'negative',
  'frustrated',
  'angry',
  'urgent',
]);

/** @param {unknown} v */
export function isClassificationIntent(v) {
  return typeof v === 'string' && CLASSIFICATION_INTENTS.includes(v);
}

/** @param {unknown} v */
export function isClassificationSentiment(v) {
  return typeof v === 'string' && CLASSIFICATION_SENTIMENTS.includes(v);
}
