/**
 * DB column patch when `conversations.status` changes (resolve / close / leave terminal).
 *
 * @param {object} params
 * @param {object} params.prior — prior row with `status`
 * @param {string} params.nextStatus
 * @param {string|null} params.actorMemberId
 * @param {string|null} [params.closedReason] — when closing; defaults to `manual`
 * @returns {Record<string, unknown>}
 */
export function buildLifecycleColumnsForStatusChange({
  prior,
  nextStatus,
  actorMemberId,
  closedReason = null,
}) {
  const now = new Date().toISOString();
  const patch = {};
  const priorStatus = prior?.status ?? 'open';

  if (nextStatus === 'resolved') {
    patch.resolved_at = now;
    patch.resolved_by_member_id = actorMemberId ?? null;
    patch.closed_at = null;
    patch.closed_reason = null;
    patch.waiting_status = '';
  }

  if (nextStatus === 'closed') {
    patch.closed_at = now;
    patch.closed_reason = closedReason ?? 'manual';
    patch.waiting_status = '';
  }

  if (nextStatus === 'spam') {
    patch.waiting_status = '';
  }

  if (priorStatus === 'resolved' && nextStatus !== 'resolved') {
    patch.resolved_at = null;
    patch.resolved_by_member_id = null;
  }

  if (priorStatus === 'closed' && nextStatus !== 'closed') {
    patch.closed_at = null;
    patch.closed_reason = null;
  }

  return patch;
}

/**
 * @param {string} priorStatus
 * @param {string} nextStatus
 * @returns {'conversation.resolved'|'conversation.closed'|'conversation.reopened'|null}
 */
export function resolveLifecycleStatusEventType(priorStatus, nextStatus) {
  if (priorStatus === nextStatus) return null;
  if (nextStatus === 'resolved') return 'conversation.resolved';
  if (nextStatus === 'closed') return 'conversation.closed';
  const wasTerminal = priorStatus === 'closed' || priorStatus === 'resolved';
  const nowTerminal = nextStatus === 'closed' || nextStatus === 'resolved';
  if (wasTerminal && !nowTerminal) return 'conversation.reopened';
  return null;
}
