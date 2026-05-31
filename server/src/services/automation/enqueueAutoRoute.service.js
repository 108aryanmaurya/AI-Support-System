import {
  autoRouteDailyBackstopIdempotencyKey,
  autoRouteIdempotencyKey,
  CONVERSATION_ACTIVE_STATUSES,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { canEnqueueAutoRoute } from '../assignment/assignmentSettings.service.js';
import { emitAutomationJob } from './enqueueJob.service.js';

/**
 * Attempt to queue intelligent assignment after inbound workflow.
 *
 * @returns {Promise<{ scheduled: boolean, reason?: string }>}
 */
export async function tryScheduleAutoRoute({ organizationId, conversationId, messageId }) {
  if (!organizationId || !conversationId || !messageId) {
    return { scheduled: false, reason: 'missing_ids' };
  }

  const { data: conv, error } = await supabaseAdmin
    .from('conversations')
    .select('id, assignment_type, assigned_to_member_id, status')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !conv) {
    return { scheduled: false, reason: 'conversation_not_found' };
  }

  const gate = await canEnqueueAutoRoute(organizationId, conversationId);
  if (!gate.allowed) {
    return { scheduled: false, reason: gate.reason ?? 'auto_route_disabled' };
  }

  if (!CONVERSATION_ACTIVE_STATUSES.includes(conv.status)) {
    return { scheduled: false, reason: 'conversation_not_active' };
  }

  const isUnassigned =
    (conv.assignment_type === 'unassigned' || !conv.assignment_type) &&
    !conv.assigned_to_member_id;
  if (!isUnassigned) {
    return { scheduled: false, reason: 'already_assigned' };
  }

  emitAutomationJob({
    organizationId,
    jobType: 'assignment.auto_route',
    payload: { conversationId, messageId },
    idempotencyKey: autoRouteIdempotencyKey(organizationId, conversationId, messageId),
    maxAttempts: 5,
  });

  return { scheduled: true };
}

/**
 * Queue intelligent assignment after inbound workflow when conversation is still unassigned.
 * Fire-and-forget wrapper around {@link tryScheduleAutoRoute}.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.messageId
 */
export function scheduleAutoRoute({ organizationId, conversationId, messageId }) {
  void (async () => {
    try {
      await tryScheduleAutoRoute({ organizationId, conversationId, messageId });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[auto_route] enqueue skipped', {
        organization_id: organizationId,
        conversation_id: conversationId,
        message_id: messageId,
        error: e?.message,
      });
    }
  })();
}

/**
 * Daily backstop: queue auto-route for an unassigned conversation (once per UTC day).
 *
 * @returns {Promise<{ scheduled: boolean, reason?: string }>}
 */
export async function tryScheduleAutoRouteDailyBackstop({
  organizationId,
  conversationId,
  messageId,
  dayKey,
}) {
  if (!organizationId || !conversationId || !messageId || !dayKey) {
    return { scheduled: false, reason: 'missing_ids' };
  }

  const { data: conv, error } = await supabaseAdmin
    .from('conversations')
    .select('id, assignment_type, assigned_to_member_id, status')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !conv) {
    return { scheduled: false, reason: 'conversation_not_found' };
  }

  const gate = await canEnqueueAutoRoute(organizationId, conversationId);
  if (!gate.allowed) {
    return { scheduled: false, reason: gate.reason ?? 'auto_route_disabled' };
  }

  if (!CONVERSATION_ACTIVE_STATUSES.includes(conv.status)) {
    return { scheduled: false, reason: 'conversation_not_active' };
  }

  const isUnassigned =
    (conv.assignment_type === 'unassigned' || !conv.assignment_type) &&
    !conv.assigned_to_member_id;
  if (!isUnassigned) {
    return { scheduled: false, reason: 'already_assigned' };
  }

  emitAutomationJob({
    organizationId,
    jobType: 'assignment.auto_route',
    payload: { conversationId, messageId, trigger: 'daily_unassigned_scan' },
    idempotencyKey: autoRouteDailyBackstopIdempotencyKey(organizationId, conversationId, dayKey),
    maxAttempts: 5,
  });

  return { scheduled: true };
}
