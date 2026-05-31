import { CONVERSATION_ACTIVE_STATUSES, isDedicatedInboxAssignmentStrategy } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { emitSupportEvent } from '../analytics/supportEvents.service.js';
import { scheduleAssignmentWithFallback } from '../automation/automationNotify.service.js';
import { updateConversationFromAutomation } from '../conversationUpdate.service.js';
import { schedulePostInboundNotification } from '../postInboundNotification.service.js';
import { applyOrgDefaultAssigneeIfUnassigned } from './applyOrgDefaultAssignee.service.js';
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
      .select('id, assignment_type, assigned_to_member_id, channel_type, status')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (convErr || !conv) {
      return { outcome: 'failed', reason: 'conversation_not_found' };
    }

    if (!CONVERSATION_ACTIVE_STATUSES.includes(conv.status)) {
      emitAutoRouteEvent(organizationId, conversationId, 'assignment.auto_skipped', {
        reason: 'conversation_not_active',
        status: conv.status,
        message_id: messageId ?? null,
      });
      return { outcome: 'skipped', reason: 'conversation_not_active' };
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

    const preview = await previewAssignmentEligibility({
      organizationId,
      conversationId,
    });

    let winnerId = null;
    let scoreSnapshot = null;
    const strategy = preview.strategy ?? null;
    if (!strategy) {
      emitAutoRouteEvent(organizationId, conversationId, 'assignment.auto_skipped', {
        reason: 'inbox_manual_assignment',
        message_id: messageId ?? null,
      });
      return { outcome: 'skipped', reason: 'inbox_manual_assignment' };
    }
    const dedicatedInboxStrategy = isDedicatedInboxAssignmentStrategy(strategy);

    if (
      !dedicatedInboxStrategy &&
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
        strategy,
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

      let defaultAssigneeApplied = false;
      if (dedicatedInboxStrategy) {
        try {
          const defaultResult = await applyOrgDefaultAssigneeIfUnassigned({
            organizationId,
            conversationId,
          });
          defaultAssigneeApplied = Boolean(defaultResult.applied);
          if (defaultAssigneeApplied) {
            logAssignmentStructured('info', {
              organization_id: organizationId,
              conversation_id: conversationId,
              strategy,
              error_code: null,
              op: 'default_assignee_after_auto_route',
              duration_ms: Date.now() - startedAt,
              default_reason: defaultResult.reason,
            });
            emitAutoRouteEvent(organizationId, conversationId, 'assignment.default_assignee_applied', {
              default_reason: defaultResult.reason,
              auto_route_reason: reason,
              message_id: messageId ?? null,
            });
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[assignment] default assignee after auto_route failed', {
            organization_id: organizationId,
            conversation_id: conversationId,
            error: e?.message,
          });
        }
      }

      const useFallbackNotify =
        !defaultAssigneeApplied &&
        ['no_candidates', 'no_vip_candidates', 'redis_unavailable', 'lock_held'].includes(reason);
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
      return {
        outcome: defaultAssigneeApplied ? 'default_assignee' : 'skipped',
        reason,
      };
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

    void scheduleAssignmentWithFallback({
      organizationId,
      conversation: updated,
      assignedToMemberId: winnerId,
      actorUserId: null,
      priorAssignedToMemberId: conv.assigned_to_member_id ?? null,
    });

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
