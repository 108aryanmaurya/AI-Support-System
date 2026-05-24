import { reassignIdempotencyKey } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { canEnqueueReassign } from '../assignment/assignmentSettings.service.js';
import { emitAutomationJob } from './enqueueJob.service.js';

/**
 * Queue reassignment for an assigned conversation (Sprint 6+).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.trigger — `agent_offline` | `sla_warning` | `sentiment`
 * @param {string} params.triggerKey — stable idempotency segment
 */
export function scheduleReassign({ organizationId, conversationId, trigger, triggerKey }) {
  void (async () => {
    try {
      if (!organizationId || !conversationId || !trigger || !triggerKey) return;

      const gate = await canEnqueueReassign(organizationId);
      if (!gate.allowed) return;

      const { data: conv, error } = await supabaseAdmin
        .from('conversations')
        .select('id, assignment_type, assigned_to_member_id')
        .eq('id', conversationId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error || !conv) return;
      if (!conv.assigned_to_member_id) return;
      if (conv.assignment_type !== 'assigned_to_agent') return;

      emitAutomationJob({
        organizationId,
        jobType: 'assignment.reassign',
        payload: {
          conversationId,
          trigger,
          priorMemberId: conv.assigned_to_member_id,
        },
        idempotencyKey: reassignIdempotencyKey(organizationId, conversationId, triggerKey),
        maxAttempts: 5,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[reassign] enqueue skipped', {
        organization_id: organizationId,
        conversation_id: conversationId,
        trigger,
        error: e?.message,
      });
    }
  })();
}

/**
 * Enqueue reassignment for all active threads owned by an agent who went offline.
 *
 * @param {string} organizationId
 * @param {string} memberId
 */
export function scheduleReassignForOfflineAgent(organizationId, memberId) {
  void (async () => {
    try {
      const { CONVERSATION_ACTIVE_STATUSES } = await import('@ai-support/shared');
      const { getOrgAssignmentSettings } = await import('../assignment/assignmentSettings.service.js');

      const routing = await getOrgAssignmentSettings(organizationId);
      if (!routing.reassign_enabled || !routing.reassign_on_agent_offline) return;

      const { data: convs, error } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('assigned_to_member_id', memberId)
        .eq('assignment_type', 'assigned_to_agent')
        .in('status', [...CONVERSATION_ACTIVE_STATUSES]);

      if (error || !convs?.length) return;

      for (const row of convs) {
        scheduleReassign({
          organizationId,
          conversationId: row.id,
          trigger: 'agent_offline',
          triggerKey: `offline:${memberId}`,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[reassign] offline sweep skipped', {
        organization_id: organizationId,
        member_id: memberId,
        error: e?.message,
      });
    }
  })();
}
