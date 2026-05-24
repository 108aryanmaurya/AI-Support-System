import { isAssignmentLogReason, isAssignmentStrategy } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';

/**
 * Append one assignment audit row. No customer message content or email in payload.
 * Fire-and-forget safe: logs and returns null on missing table / errors.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string | null} [params.assignedFrom]
 * @param {string | null} [params.assignedTo]
 * @param {string | null} [params.assignmentType]
 * @param {string} params.reason — {@link import('@ai-support/shared').ASSIGNMENT_LOG_REASONS}
 * @param {string | null} [params.strategy]
 * @param {Record<string, unknown> | null} [params.scoreSnapshot]
 * @param {string | null} [params.actorMemberId]
 * @returns {Promise<string | null>} log id or null
 */
export async function appendAssignmentLog({
  organizationId,
  conversationId,
  assignedFrom = null,
  assignedTo = null,
  assignmentType = null,
  reason,
  strategy = null,
  scoreSnapshot = null,
  actorMemberId = null,
}) {
  if (!organizationId || !conversationId || !reason) return null;
  if (!isAssignmentLogReason(reason)) {
    // eslint-disable-next-line no-console
    console.warn('[assignment_log] invalid reason', { organization_id: organizationId, reason });
    return null;
  }
  if (strategy != null && strategy !== '' && !isAssignmentStrategy(strategy)) {
    // eslint-disable-next-line no-console
    console.warn('[assignment_log] invalid strategy', { organization_id: organizationId, strategy });
    return null;
  }

  const row = {
    organization_id: organizationId,
    conversation_id: conversationId,
    assigned_from: assignedFrom || null,
    assigned_to: assignedTo || null,
    assignment_type: assignmentType || null,
    reason,
    strategy: strategy || null,
    score_snapshot:
      scoreSnapshot && typeof scoreSnapshot === 'object' ? scoreSnapshot : null,
    actor_member_id: actorMemberId || null,
  };

  const { data, error } = await supabaseAdmin
    .from('assignment_logs')
    .insert(row)
    .select('id')
    .maybeSingle();

  if (error) {
    const missing =
      error.message?.includes('assignment_logs') ||
      error.code === '42P01' ||
      error.code === 'PGRST205';
    if (missing) {
      // eslint-disable-next-line no-console
      console.warn('[assignment_log] table missing; skip append');
      return null;
    }
    // eslint-disable-next-line no-console
    console.error('[assignment_log] append failed', {
      organization_id: organizationId,
      conversation_id: conversationId,
      error_code: error.code,
      message: error.message,
    });
    return null;
  }

  return data?.id ?? null;
}

/**
 * Resolve assignment log reason from update context.
 *
 * @param {object} params
 * @param {boolean} [params.automationSource]
 * @param {object | null} [params.workflowMeta]
 * @param {string | null} [params.assignedToMemberId]
 * @param {string} [params.assignmentType]
 */
/**
 * Latest audit row for a conversation (Sprint 7+ inbox visibility).
 *
 * @param {string} organizationId
 * @param {string} conversationId
 */
export async function getLatestAssignmentLogForConversation(organizationId, conversationId) {
  if (!organizationId || !conversationId) return null;

  const { data, error } = await supabaseAdmin
    .from('assignment_logs')
    .select(
      'id, reason, strategy, score_snapshot, assigned_from, assigned_to, assignment_type, created_at, actor_member_id',
    )
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const missing =
      error.message?.includes('assignment_logs') ||
      error.code === '42P01' ||
      error.code === 'PGRST205';
    if (missing) return null;
    // eslint-disable-next-line no-console
    console.warn('[assignment_log] latest read failed', {
      organization_id: organizationId,
      conversation_id: conversationId,
      message: error.message,
    });
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    reason: data.reason,
    strategy: data.strategy,
    scoreSnapshot: data.score_snapshot ?? null,
    assignedFrom: data.assigned_from,
    assignedTo: data.assigned_to,
    assignmentType: data.assignment_type,
    createdAt: data.created_at,
    actorMemberId: data.actor_member_id,
  };
}

export function resolveAssignmentLogReason({
  automationSource,
  workflowMeta,
  assignedToMemberId,
  assignmentType,
}) {
  if (workflowMeta?.autoRoute === true) return 'auto_route';
  if (workflowMeta?.reassign === true) return 'reassign';
  if (automationSource && workflowMeta?.ruleId) return 'workflow';
  if (automationSource) return 'system';
  if (!assignedToMemberId && assignmentType === 'unassigned') return 'unassign';
  return 'manual';
}
