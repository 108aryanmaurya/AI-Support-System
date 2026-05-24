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
  'sla.first_response_breach',
  'knowledge.search',
  'knowledge.article_viewed',
  'knowledge.article_published',
  'knowledge.ingest_completed',
  'knowledge.ingest_failed',
  'ai.suggestion_accepted',
  'ai.suggestion_rejected',
  'ai.suggestion_edited',
  'workflow.action_applied',
  'workflow.action_skipped',
  'workflow.action_failed',
  'ingress.spam_flagged',
  'ingress.spam_rejected',
  'ingress.duplicate_suppressed',
  'workflow.sla_warning_applied',
  'workflow.tag_added_applied',
  'assignment.auto_applied',
  'assignment.auto_skipped',
  'assignment.auto_failed',
  'assignment.reassigned',
  'assignment.reassign_skipped',
]);

/** @param {unknown} v */
export function isSupportEventType(v) {
  return typeof v === 'string' && SUPPORT_EVENT_TYPES.includes(v);
}
