import { autoRouteIdempotencyKey } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { canEnqueueAutoRoute } from '../assignment/assignmentSettings.service.js';
import { emitAutomationJob } from './enqueueJob.service.js';

/**
 * Queue intelligent assignment after inbound workflow when conversation is still unassigned.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.messageId
 */
export function scheduleAutoRoute({ organizationId, conversationId, messageId }) {
  void (async () => {
    try {
      if (!organizationId || !conversationId || !messageId) return;

      const gate = await canEnqueueAutoRoute(organizationId);
      if (!gate.allowed) return;

      const { data: conv, error } = await supabaseAdmin
        .from('conversations')
        .select('id, assignment_type, assigned_to_member_id')
        .eq('id', conversationId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error || !conv) return;

      const isUnassigned =
        (conv.assignment_type === 'unassigned' || !conv.assignment_type) &&
        !conv.assigned_to_member_id;
      if (!isUnassigned) return;

      emitAutomationJob({
        organizationId,
        jobType: 'assignment.auto_route',
        payload: { conversationId, messageId },
        idempotencyKey: autoRouteIdempotencyKey(organizationId, conversationId, messageId),
        maxAttempts: 5,
      });
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
