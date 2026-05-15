/** Append-only `support_events.event_type` values. */
export const SUPPORT_EVENT_TYPES = Object.freeze([
  'message.inbound',
  'message.outbound_sent',
  'message.outbound_failed',
  'conversation.created',
  'conversation.closed',
  'conversation.reopened',
  'conversation.assigned',
  'conversation.priority_changed',
  'member.first_response',
]);

/** @param {unknown} v */
export function isSupportEventType(v) {
  return typeof v === 'string' && SUPPORT_EVENT_TYPES.includes(v);
}
