import { supabaseAdmin } from '../../config/supabase.js';
import { emitSupportEvent } from '../analytics/supportEvents.service.js';
import { updateConversationFromAutomation } from '../conversationUpdate.service.js';
import { schedulePostInboundNotification } from '../postInboundNotification.service.js';
import { getOrgAssignmentSettings } from './assignmentSettings.service.js';
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
 * @param {string} reason
 */
async function markAssignmentFallbackMetadata(organizationId, conversationId, reason) {
  const { data: row, error: readErr } = await supabaseAdmin
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (readErr || !row) return;

  const meta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
  const prior =
    meta.assignment && typeof meta.assignment === 'object' ? { ...meta.assignment } : {};

  meta.assignment = {
    ...prior,
    fallback: 'unassigned_queue',
    fallback_reason: reason,
    updated_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from('conversations')
    .update({ metadata: meta })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.messageId
 */
function emitAutoRouteEvent(organizationId, conversationId, eventType, payload) {
  emitSupportEvent({
    organizationId,
    eventType,
    entityType: 'conversation',
    entityId: conversationId,
    payload,
  });
}

/**
 * Run intelligent auto-assignment for one conversation (Sprint 5).
 *
 * @returns {Promise<{ outcome: string, memberId?: string, reason?: string }>}
 */
export async function runAutoAssignConversation({
  organizationId,
  conversationId,
  messageId,
}) {
  const startedAt = Date.now();
  if (!organizationId || !conversationId) {
    return { outcome: 'skipped', reason: 'missing_ids' };
  }

  if (!(await isAssignmentRedisAvailable())) {
    logAssignmentStructured('warn', {
      organization_id: organizationId,
      conversation_id: conversationId,
      error_code: 'redis_unavailable',
      op: 'auto_route',
    });
    emitAutoRouteEvent(organizationId, conversationId, 'assignment.auto_skipped', {
      reason: 'redis_unavailable',
      message_id: messageId ?? null,
    });
    if (messageId) {
      void schedulePostInboundNotification({
        organizationId,
        conversationId,
        messageId,
        mode: 'routing_fallback',
        autoRouteReason: 'redis_unavailable',
      });
    }
    return { outcome: 'skipped', reason: 'redis_unavailable' };
  }

  const lockOk = await acquireConversationAssignmentLock(conversationId, { organizationId });
  if (!lockOk) {
    emitAutoRouteEvent(organizationId, conversationId, 'assignment.auto_skipped', {
      reason: 'lock_held',
      message_id: messageId ?? null,
    });
    if (messageId) {
      void schedulePostInboundNotification({
        organizationId,
        conversationId,
        messageId,
        mode: 'routing_fallback',
        autoRouteReason: 'lock_held',
      });
    }
    return { outcome: 'skipped', reason: 'lock_held' };
  }

  try {
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id, assignment_type, assigned_to_member_id, channel_type')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (convErr || !conv) {
      return { outcome: 'failed', reason: 'conversation_not_found' };
    }

    const isUnassigned =
      (conv.assignment_type === 'unassigned' || !conv.assignment_type) &&
      !conv.assigned_to_member_id;
    if (!isUnassigned) {
      emitAutoRouteEvent(organizationId, conversationId, 'assignment.auto_skipped', {
        reason: 'already_assigned',
        assignment_type: conv.assignment_type,
        message_id: messageId ?? null,
      });
      return { outcome: 'skipped', reason: 'already_assigned' };
    }

    const routing = await getOrgAssignmentSettings(organizationId);
    const strategyForLog = routing.strategy ?? 'weighted_hybrid';
    const preview = await previewAssignmentEligibility({
      organizationId,
      conversationId,
    });

    let winnerId = null;
    let scoreSnapshot = null;
    const strategy = preview.strategy ?? routing.strategy ?? 'weighted_hybrid';

    if (
      preview.previousAgentId &&
      preview.eligibleMemberIds.includes(preview.previousAgentId)
    ) {
      winnerId = preview.previousAgentId;
      const stickyRow = preview.rankedCandidates?.find(
        (r) => r.memberId === preview.previousAgentId,
      );
      scoreSnapshot = {
        sticky: true,
        finalScore: stickyRow?.finalScore ?? null,
        breakdown: stickyRow?.breakdown ?? null,
        skillMatchTier: stickyRow?.skillMatchTier ?? null,
      };
    } else if (preview.recommendedMemberId) {
      winnerId = preview.recommendedMemberId;
      const row = preview.rankedCandidates?.find((r) => r.memberId === winnerId);
      scoreSnapshot = {
        sticky: false,
        finalScore: row?.finalScore ?? null,
        breakdown: row?.breakdown ?? null,
        factors: row?.factors ?? null,
        skillMatchTier: row?.skillMatchTier ?? null,
        targetInbox: preview.targetInbox?.inboxId ?? null,
      };
    }

    if (!winnerId) {
      const reason = preview.noCandidates?.reason ?? 'no_candidates';
      await markAssignmentFallbackMetadata(organizationId, conversationId, reason);
      logAssignmentStructured('info', {
        organization_id: organizationId,
        conversation_id: conversationId,
        strategy: strategyForLog,
        error_code: 'no_candidates',
        op: 'auto_route',
        duration_ms: Date.now() - startedAt,
      });
      emitAutoRouteEvent(organizationId, conversationId, 'assignment.auto_skipped', {
        reason,
        primary_codes: preview.noCandidates?.primaryCodes ?? [],
        message_id: messageId ?? null,
        duration_ms: Date.now() - startedAt,
      });
      const useFallbackNotify = [
        'no_candidates',
        'no_vip_candidates',
        'redis_unavailable',
        'lock_held',
      ].includes(reason);
      if (useFallbackNotify && messageId) {
       
        void schedulePostInboundNotification({
          organizationId,
          conversationId,
          messageId,
          mode: 'routing_fallback',
          autoRouteReason: reason,
          primaryCodes: preview.noCandidates?.primaryCodes ?? [],
        });
      }
      return { outcome: 'skipped', reason };
    }

    const { conversation: updated } = await updateConversationFromAutomation({
      organizationId,
      conversationId,
      assignedToMemberId: winnerId,
      assignmentType: 'assigned_to_agent',
      workflowMeta: {
        autoRoute: true,
        assignmentLog: {
          strategy,
          scoreSnapshot: {
            ...scoreSnapshot,
            message_id: messageId ?? null,
          },
        },
      },
    });

    if (messageId) {
     
        void schedulePostInboundNotification({
          organizationId,
          conversationId,
          messageId,
          mode: 'auto_assigned_first_touch',
          assignedToMemberId: winnerId,
        });
    }

    const durationMs = Date.now() - startedAt;
    logAssignmentStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      strategy,
      error_code: null,
      op: 'auto_route',
      duration_ms: durationMs,
      assigned_to_member_id: winnerId,
    });
    emitAutoRouteEvent(organizationId, conversationId, 'assignment.auto_applied', {
      assigned_to_member_id: winnerId,
      strategy,
      sticky: Boolean(scoreSnapshot?.sticky),
      final_score: scoreSnapshot?.finalScore ?? null,
      target_inbox: preview.targetInbox?.inboxId ?? null,
      message_id: messageId ?? null,
      duration_ms: durationMs,
    });

    return { outcome: 'applied', memberId: winnerId };
  } catch (e) {
    const reason = e?.message ?? 'auto_route_error';
    logAssignmentStructured('error', {
      organization_id: organizationId,
      conversation_id: conversationId,
      strategy: null,
      error_code: 'auto_route_failed',
      op: 'auto_route',
      duration_ms: Date.now() - startedAt,
      message: reason,
    });
    emitAutoRouteEvent(organizationId, conversationId, 'assignment.auto_failed', {
      reason,
      message_id: messageId ?? null,
      duration_ms: Date.now() - startedAt,
    });
    throw e;
  } finally {
    await releaseConversationAssignmentLock(conversationId);
  }
}
