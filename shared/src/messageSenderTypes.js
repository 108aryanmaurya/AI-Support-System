/**
 * Allowed `messages.sender_type` values (DB + API contract).
 * Order matches product naming; DB check uses the same set.
 */
export const MESSAGE_SENDER_TYPES = Object.freeze([
  'customer',
  'agent',
  'system',
  'ai',
  'internal_note',
]);

/** @param {unknown} value */
export function isMessageSenderType(value) {
  return typeof value === 'string' && MESSAGE_SENDER_TYPES.includes(value);
}
