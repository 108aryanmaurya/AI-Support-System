import { supabaseAdmin } from '../../config/supabase.js';
import { emitSupportEvent } from '../analytics/supportEvents.service.js';
import { updateConversationFromAutomation } from '../conversationUpdate.service.js';
import { scheduleAssignmentWithFallback } from '../automation/automationNotify.service.js';
import { previewAssignmentEligibility } from './assignmentEligibility.service.js';
import {
  acquireConversationAssignmentLock,
  isAssignmentRedisAvailable,
  releaseConversationAssignmentLock,
} from './assignmentRedis.service.js';
import { logAssignmentStructured } from './assignmentStructuredLog.service.js';

/**
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {string} eventType
 * @param {object} payload
 */
function emitReassignEvent(organizationId, conversationId, eventType, payload) {
  emitSupportEvent({
    organizationId,
    eventType,
    entityType: 'conversation',
    entityId: conversationId,
    payload,
  });
}

/**
 * Reassign an already-assigned conversation to a new eligible agent (Sprint 6).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} [params.trigger]
 * @param {string | null} [params.priorMemberId]
 */
export async function runReassignConversation({
  organizationId,
  conversationId,
  trigger = 'system',
  priorMemberId = null,
}) {
  if (!organizationId || !conversationId) {
    return { outcome: 'skipped', reason: 'missing_ids' };
  }

  const startedAt = Date.now();

  if (!(await isAssignmentRedisAvailable())) {
    logAssignmentStructured('warn', {
      organization_id: organizationId,
      conversation_id: conversationId,
      error_code: 'redis_unavailable',
      op: 'reassign',
      trigger,
    });
    emitReassignEvent(organizationId, conversationId, 'assignment.reassign_skipped', {
      reason: 'redis_unavailable',
      trigger,
    });
    return { outcome: 'skipped', reason: 'redis_unavailable' };
  }

  const lockOk = await acquireConversationAssignmentLock(conversationId, { organizationId });
  if (!lockOk) {
    emitReassignEvent(organizationId, conversationId, 'assignment.reassign_skipped', {
      reason: 'lock_held',
      trigger,
    });
    return { outcome: 'skipped', reason: 'lock_held' };
  }

  try {
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id, assignment_type, assigned_to_member_id')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (convErr || !conv) {
      return { outcome: 'failed', reason: 'conversation_not_found' };
    }

    const currentAssignee = conv.assigned_to_member_id ?? priorMemberId;
    if (!currentAssignee || conv.assignment_type !== 'assigned_to_agent') {
      emitReassignEvent(organizationId, conversationId, 'assignment.reassign_skipped', {
        reason: 'not_assigned',
        trigger,
      });
      return { outcome: 'skipped', reason: 'not_assigned' };
    }

    const preview = await previewAssignmentEligibility({
      organizationId,
      conversationId,
      excludeMemberIds: [currentAssignee],
      skipSticky: true,
    });

    const winnerId = preview.recommendedMemberId;
    if (!winnerId) {
      emitReassignEvent(organizationId, conversationId, 'assignment.reassign_skipped', {
        reason: preview.noCandidates?.reason ?? 'no_candidates',
        trigger,
        prior_member_id: currentAssignee,
      });
      return { outcome: 'skipped', reason: 'no_candidates' };
    }

    if (winnerId === currentAssignee) {
      emitReassignEvent(organizationId, conversationId, 'assignment.reassign_skipped', {
        reason: 'same_assignee',
        trigger,
      });
      return { outcome: 'skipped', reason: 'same_assignee' };
    }

    const strategy = preview.strategy ?? null;
    if (!strategy) {
      emitReassignEvent(organizationId, conversationId, 'assignment.reassign_skipped', {
        reason: 'inbox_manual_assignment',
        trigger,
        prior_member_id: currentAssignee,
      });
      return { outcome: 'skipped', reason: 'inbox_manual_assignment' };
    }

    const row = preview.rankedCandidates?.find((r) => r.memberId === winnerId);
    const scoreSnapshot = {
      reassign: true,
      trigger,
      prior_member_id: currentAssignee,
      finalScore: row?.finalScore ?? null,
      breakdown: row?.breakdown ?? null,
      factors: row?.factors ?? null,
      skillMatchTier: row?.skillMatchTier ?? null,
      targetInbox: preview.targetInbox?.inboxId ?? null,
    };

    const { conversation: updated } = await updateConversationFromAutomation({
      organizationId,
      conversationId,
      assignedToMemberId: winnerId,
      assignmentType: 'assigned_to_agent',
      workflowMeta: {
        reassign: true,
        assignmentLog: {
          strategy,
          scoreSnapshot,
        },
      },
    });

    void scheduleAssignmentWithFallback({
      organizationId,
      conversation: updated,
      assignedToMemberId: winnerId,
      actorUserId: null,
      priorAssignedToMemberId: currentAssignee,
    });

    const durationMs = Date.now() - startedAt;
    logAssignmentStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      strategy,
      error_code: null,
      op: 'reassign',
      trigger,
      duration_ms: durationMs,
      assigned_to_member_id: winnerId,
    });
    emitReassignEvent(organizationId, conversationId, 'assignment.reassigned', {
      assigned_to_member_id: winnerId,
      prior_member_id: currentAssignee,
      strategy,
      trigger,
      final_score: scoreSnapshot.finalScore,
      duration_ms: durationMs,
    });

    return { outcome: 'applied', memberId: winnerId, priorMemberId: currentAssignee };
  } catch (e) {
    const reason = e?.message ?? 'reassign_error';
    logAssignmentStructured('error', {
      organization_id: organizationId,
      conversation_id: conversationId,
      strategy: null,
      error_code: 'reassign_failed',
      op: 'reassign',
      trigger,
      duration_ms: Date.now() - startedAt,
      message: reason,
    });
    throw e;
  } finally {
    await releaseConversationAssignmentLock(conversationId);
  }
}
