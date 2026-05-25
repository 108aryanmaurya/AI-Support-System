import {
  CONVERSATION_ASSIGNMENT_TYPES,
  CONVERSATION_PRIORITIES,
  CONVERSATION_STATUSES,
  isConversationAssignmentType,
  isConversationPriority,
  isConversationStatus,
} from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { ensureOrgMembership } from './support.service.js';
import { emitSupportEvent } from './analytics/supportEvents.service.js';

/**
 * Partial PATCH for conversations: assignment, lifecycle status, priority, queue type.
 * Keeps `is_spam` aligned when `status` is `spam` vs non-spam.
 */
export async function updateConversationFields({
  organizationId,
  conversationId,
  actorUserId,
  assignedToMemberId = undefined,
  status: statusPatch = undefined,
  priority: priorityPatch = undefined,
  assignmentType: assignmentTypePatch = undefined,
  aiEnabled: aiEnabledPatch = undefined,
  automationSource = false,
  workflowMeta = undefined,
}) {
  const actorMember = automationSource
    ? null
    : await ensureOrgMembership(actorUserId, organizationId);

  const { data: prior, error: priorErr } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (priorErr) {
    throw new HttpError(500, priorErr.message || 'Failed to load conversation.');
  }
  if (!prior) {
    throw new HttpError(404, 'Conversation not found in this organization.');
  }

  const priorAssignedToMemberId = prior.assigned_to_member_id ?? null;

  let assigned_to_member_id = prior.assigned_to_member_id ?? null;
  let assignment_type = prior.assignment_type ?? 'unassigned';
  let status = prior.status ?? 'open';
  let priority = prior.priority ?? 'medium';
  let is_spam = Boolean(prior.is_spam);
  let ai_enabled = prior.ai_enabled ?? true;

  if (aiEnabledPatch !== undefined) {
    ai_enabled = Boolean(aiEnabledPatch);
  }

  if (statusPatch !== undefined) {
    const s = typeof statusPatch === 'string' ? statusPatch.trim() : statusPatch;
    if (!isConversationStatus(s)) {
      throw new HttpError(400, `status must be one of: ${CONVERSATION_STATUSES.join(', ')}.`);
    }
    status = s;
    if (status === 'spam') {
      is_spam = true;
    } else {
      is_spam = false;
    }
  }

  if (priorityPatch !== undefined) {
    if (priorityPatch === null) {
      priority = null;
    } else {
      const p = typeof priorityPatch === 'string' ? priorityPatch.trim() : priorityPatch;
      if (!isConversationPriority(p)) {
        throw new HttpError(400, `priority must be one of: ${CONVERSATION_PRIORITIES.join(', ')}.`);
      }
      priority = p;
    }
  }

  if (assignedToMemberId !== undefined) {
    if (assignedToMemberId === null || assignedToMemberId === '') {
      assigned_to_member_id = null;
      if (assignmentTypePatch === undefined) {
        assignment_type = 'unassigned';
      }
    } else {
      if (typeof assignedToMemberId !== 'string') {
        throw new HttpError(400, 'assignedToMemberId must be a uuid string or null.');
      }
      assigned_to_member_id = assignedToMemberId;
      if (assignmentTypePatch === undefined) {
        assignment_type = 'assigned_to_agent';
      }
    }
  }

  if (assignmentTypePatch !== undefined) {
    const a = typeof assignmentTypePatch === 'string' ? assignmentTypePatch.trim() : assignmentTypePatch;
    if (!isConversationAssignmentType(a)) {
      throw new HttpError(
        400,
        `assignmentType must be one of: ${CONVERSATION_ASSIGNMENT_TYPES.join(', ')}.`,
      );
    }
    assignment_type = a;
    if (assignment_type === 'unassigned' || assignment_type === 'assigned_to_ai') {
      assigned_to_member_id = null;
    }
    if (assignment_type === 'assigned_to_agent' && !assigned_to_member_id) {
      throw new HttpError(
        400,
        'assigned_to_agent requires assignedToMemberId on this conversation or in the same request.',
      );
    }
  }

  if (assigned_to_member_id && assignment_type === 'unassigned') {
    assignment_type = 'assigned_to_agent';
  }
  if (!assigned_to_member_id && assignment_type === 'assigned_to_agent') {
    throw new HttpError(400, 'assigned_to_agent requires an assignee member id.');
  }

  if (status === 'spam') {
    assigned_to_member_id = null;
    assignment_type = 'unassigned';
  }

  if (assignment_type === 'assigned_to_ai') {
    const { assertCanAssignConversationToAi } = await import('./ai/workflowAiGates.service.js');
    await assertCanAssignConversationToAi({
      organizationId,
      conversationId,
      conversationAiEnabled: ai_enabled,
    });
  }

  if (assigned_to_member_id) {
    const { data: assignee, error: assigneeError } = await supabaseAdmin
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', assigned_to_member_id)
      .maybeSingle();

    if (assigneeError) {
      throw new HttpError(500, assigneeError.message || 'Failed to validate assignee.');
    }
    if (!assignee) {
      throw new HttpError(400, 'Assignee must be a member of this organization.');
    }
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update({
      assigned_to_member_id,
      assignment_type,
      status,
      priority,
      is_spam,
      ai_enabled,
    })
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === '23514') {
      throw new HttpError(400, error.message || 'Conversation update validation failed.');
    }
    throw new HttpError(500, error.message || 'Failed to update conversation.');
  }
  if (!data) {
    throw new HttpError(404, 'Conversation not found in this organization.');
  }

  if (prior.status !== data.status) {
    const nowClosed = data.status === 'closed' || data.status === 'resolved';
    const wasClosed = prior.status === 'closed' || prior.status === 'resolved';
    const eventType = nowClosed
      ? 'conversation.closed'
      : wasClosed
        ? 'conversation.reopened'
        : null;
    if (eventType) {
      emitSupportEvent({
        organizationId,
        eventType,
        entityType: 'conversation',
        entityId: conversationId,
        actorMemberId: actorMember?.id ?? null,
        channelType: data.channel_type ?? null,
        payload: { status: data.status, prior_status: prior.status },
      });
    }
  }

  if (
    prior.assignment_type !== data.assignment_type ||
    prior.assigned_to_member_id !== data.assigned_to_member_id
  ) {
    const assignmentPayload = {
      assignment_type: data.assignment_type,
      assigned_to_member_id: data.assigned_to_member_id,
    };
    if (workflowMeta && typeof workflowMeta === 'object') {
      assignmentPayload.workflow = workflowMeta;
    }
    emitSupportEvent({
      organizationId,
      eventType: 'conversation.assigned',
      entityType: 'conversation',
      entityId: conversationId,
      actorMemberId: actorMember?.id ?? null,
      channelType: data.channel_type ?? null,
      payload: assignmentPayload,
    });

    void (async () => {
      try {
        const { appendAssignmentLog, resolveAssignmentLogReason } = await import(
          './assignment/assignmentLog.service.js'
        );
        const logMeta =
          workflowMeta?.assignmentLog && typeof workflowMeta.assignmentLog === 'object'
            ? workflowMeta.assignmentLog
            : {};
        const assignmentReason = resolveAssignmentLogReason({
          automationSource,
          workflowMeta,
          assignedToMemberId: data.assigned_to_member_id,
          assignmentType: data.assignment_type,
        });
  
        await appendAssignmentLog({
          organizationId,
          conversationId,
          assignedFrom: prior.assigned_to_member_id ?? null,
          assignedTo: data.assigned_to_member_id ?? null,
          assignmentType: data.assignment_type ?? null,
          reason: assignmentReason,
          strategy: typeof logMeta.strategy === 'string' ? logMeta.strategy : null,
          scoreSnapshot:
            logMeta.scoreSnapshot && typeof logMeta.scoreSnapshot === 'object'
              ? logMeta.scoreSnapshot
              : null,
          actorMemberId: actorMember?.id ?? null,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[assignment_log] append skipped', {
          organization_id: organizationId,
          conversation_id: conversationId,
          error: e?.message,
        });
      }
    })();
  }

  if (prior.priority !== data.priority) {
    const priorityPayload = { priority: data.priority };
    if (workflowMeta && typeof workflowMeta === 'object') {
      priorityPayload.workflow = workflowMeta;
    }
    emitSupportEvent({
      organizationId,
      eventType: 'conversation.priority_changed',
      entityType: 'conversation',
      entityId: conversationId,
      actorMemberId: actorMember?.id ?? null,
      channelType: data.channel_type ?? null,
      payload: priorityPayload,
    });
  }

  void (async () => {
    try {
      const { syncWorkloadOnConversationUpdate } = await import(
        './assignment/agentWorkload.service.js'
      );
      await syncWorkloadOnConversationUpdate(organizationId, prior, data);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[assignment_workload] sync skipped', {
        organization_id: organizationId,
        conversation_id: conversationId,
        error: e?.message,
      });
    }
  })();

  return { conversation: data, priorAssignedToMemberId };
}

/**
 * Phase 4 workflow automation — no human actor; same validation as agent updates.
 */
export async function updateConversationFromAutomation({
  organizationId,
  conversationId,
  assignedToMemberId = undefined,
  status = undefined,
  priority = undefined,
  assignmentType = undefined,
  aiEnabled = undefined,
  workflowMeta = undefined,
}) {
  return updateConversationFields({
    organizationId,
    conversationId,
    actorUserId: null,
    assignedToMemberId,
    status,
    priority,
    assignmentType,
    aiEnabled,
    automationSource: true,
    workflowMeta,
  });
}
