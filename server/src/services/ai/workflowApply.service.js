import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { updateConversationFromAutomation } from '../conversationUpdate.service.js';
import { listTagDefinitions, mergeConversationTagsByIds } from '../tags.service.js';
import {
  scheduleSlaBreachNotification,
  scheduleStaffInboundNotification,
} from '../automation/automationNotify.service.js';
import { emitSupportEvent } from '../analytics/supportEvents.service.js';
import { canAssignConversationToAi, isPhase6AutonomousSendEnabled } from './workflowAiGates.service.js';
import { logWorkflowEvent } from './workflowLog.service.js';
import { recordSlaWorkflowPriority } from './workflowConversationFlags.service.js';

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.ruleId
 * @param {string} params.actionType
 * @param {string} params.reason
 * @param {string} [params.messageId]
 * @param {string} [params.channelType]
 */
function emitWorkflowActionSkipped({
  organizationId,
  conversationId,
  ruleId,
  actionType,
  reason,
  messageId,
  channelType,
}) {
  emitSupportEvent({
    organizationId,
    eventType: 'workflow.action_skipped',
    entityType: 'conversation',
    entityId: conversationId,
    actorMemberId: null,
    channelType,
    payload: { rule_id: ruleId, action_type: actionType, reason, message_id: messageId ?? null },
  });
  logWorkflowEvent({
    organization_id: organizationId,
    conversation_id: conversationId,
    message_id: messageId ?? null,
    rule_id: ruleId,
    event: 'action_skipped',
    action: actionType,
    reason,
  });
}

/**
 * @param {object} params
 */
function emitWorkflowActionApplied(params) {
  emitSupportEvent({
    organizationId: params.organizationId,
    eventType: 'workflow.action_applied',
    entityType: 'conversation',
    entityId: params.conversationId,
    actorMemberId: null,
    channelType: params.channelType ?? null,
    payload: {
      rule_id: params.ruleId,
      action_type: params.actionType,
      message_id: params.messageId ?? null,
      detail: params.detail ?? {},
    },
  });
  logWorkflowEvent({
    organization_id: params.organizationId,
    conversation_id: params.conversationId,
    message_id: params.messageId ?? null,
    rule_id: params.ruleId,
    event: 'action_applied',
    action: params.actionType,
  });
}

/**
 * @param {object} action
 * @param {object} ctx
 * @param {string} ctx.organizationId
 * @param {string} ctx.conversationId
 * @param {string} ctx.ruleId
 * @param {string} [ctx.messageId]
 * @param {string} [ctx.channelType]
 * @param {string} [ctx.customerMessage]
 * @param {string} [ctx.customerEmail]
 * @param {string} [ctx.workflowTrigger]
 * @param {number} [ctx.slaMinutes]
 * @param {'first_response' | 'next_response'} [ctx.breachType]
 */
/**
 * @returns {'applied' | 'skipped'}
 */
async function applyWorkflowAction(action, ctx) {
  const type = action.type;
  if (type === 'set_priority') {
    await updateConversationFromAutomation({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      priority: action.priority,
      workflowMeta: { ruleId: ctx.ruleId, actionType: type },
    });
    if (ctx.workflowTrigger === 'sla_warning') {
      await recordSlaWorkflowPriority({
        organizationId: ctx.organizationId,
        conversationId: ctx.conversationId,
        priority: action.priority,
      });
    }
    emitWorkflowActionApplied({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      ruleId: ctx.ruleId,
      actionType: type,
      messageId: ctx.messageId,
      channelType: ctx.channelType,
      detail: { priority: action.priority },
    });
    return 'applied';
  }

  if (type === 'set_assignment') {
    await updateConversationFromAutomation({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      assignmentType: action.assignmentType,
      assignedToMemberId: action.assignedToMemberId ?? null,
      workflowMeta: { ruleId: ctx.ruleId, actionType: type },
    });
    emitWorkflowActionApplied({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      ruleId: ctx.ruleId,
      actionType: type,
      messageId: ctx.messageId,
      channelType: ctx.channelType,
      detail: {
        assignmentType: action.assignmentType,
        assignedToMemberId: action.assignedToMemberId ?? null,
      },
    });
    return 'applied';
  }

  if (type === 'assign_to_ai') {
    const gate = await canAssignConversationToAi({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
    });
    if (!gate.allowed) {
      emitWorkflowActionSkipped({
        organizationId: ctx.organizationId,
        conversationId: ctx.conversationId,
        ruleId: ctx.ruleId,
        actionType: type,
        reason: gate.reason ?? 'ai_gate',
        messageId: ctx.messageId,
        channelType: ctx.channelType,
      });
      return 'skipped';
    }
    await updateConversationFromAutomation({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      assignmentType: 'assigned_to_ai',
      assignedToMemberId: null,
      workflowMeta: { ruleId: ctx.ruleId, actionType: type },
    });
    emitWorkflowActionApplied({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      ruleId: ctx.ruleId,
      actionType: type,
      messageId: ctx.messageId,
      channelType: ctx.channelType,
    });
    return 'applied';
  }

  if (type === 'add_tag') {
    let tagId = action.tagId ?? null;
    if (!tagId && action.tagName) {
      const { tags } = await listTagDefinitions(ctx.organizationId);
      const wanted = String(action.tagName).trim().toLowerCase();
      const found = (tags ?? []).find((t) => String(t.name).trim().toLowerCase() === wanted);
      tagId = found?.id ?? null;
    }
    if (!tagId) {
      emitWorkflowActionSkipped({
        organizationId: ctx.organizationId,
        conversationId: ctx.conversationId,
        ruleId: ctx.ruleId,
        actionType: type,
        reason: 'tag_not_found',
        messageId: ctx.messageId,
        channelType: ctx.channelType,
      });
      return 'skipped';
    }
    await mergeConversationTagsByIds({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      tagIdsToAdd: [tagId],
    });
    emitWorkflowActionApplied({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      ruleId: ctx.ruleId,
      actionType: type,
      messageId: ctx.messageId,
      channelType: ctx.channelType,
      detail: { tag_id: tagId },
    });
    return 'applied';
  }

  if (type === 'notify') {
    const channel = action.channel === 'assignee' ? 'assignee' : 'staff';
    const idempotencyKey = `post-inbound:${ctx.organizationId}:${ctx.messageId ?? ctx.conversationId}:standard`;

    if (ctx.workflowTrigger === 'sla_warning') {
      const breachType =
        ctx.breachType === 'next_response' ? 'next_response' : 'first_response';
      void scheduleSlaBreachNotification({
        organizationId: ctx.organizationId,
        conversationId: ctx.conversationId,
        slaMinutes: ctx.slaMinutes,
        breachType,
        source: 'workflow',
        channel,
        ruleId: ctx.ruleId,
      });
      emitWorkflowActionApplied({
        organizationId: ctx.organizationId,
        conversationId: ctx.conversationId,
        ruleId: ctx.ruleId,
        actionType: type,
        messageId: ctx.messageId,
        channelType: ctx.channelType,
        detail: { channel, notification: 'sla_warning' },
      });
      return 'applied';
    }

    if (channel === 'assignee') {
      emitWorkflowActionSkipped({
        organizationId: ctx.organizationId,
        conversationId: ctx.conversationId,
        ruleId: ctx.ruleId,
        actionType: type,
        reason: 'assignee_notify_not_implemented',
        messageId: ctx.messageId,
        channelType: ctx.channelType,
      });
      return 'skipped';
    }

    scheduleStaffInboundNotification({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      messageId: ctx.messageId ?? null,
      customerMessage: ctx.customerMessage ?? '(workflow notification)',
      customerEmail: ctx.customerEmail ?? '',
      channelLabel: 'workflow',
      idempotencyKey,
      mode: 'standard',
    });
    emitWorkflowActionApplied({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      ruleId: ctx.ruleId,
      actionType: type,
      messageId: ctx.messageId,
      channelType: ctx.channelType,
      detail: { channel: 'staff' },
    });
    return 'applied';
  }

  if (type === 'enqueue_phase6') {
    const phase6On = await isPhase6AutonomousSendEnabled(ctx.organizationId);
    const reason = phase6On ? 'phase6_pipeline_not_implemented' : 'phase6_not_enabled';
    logWorkflowEvent({
      organization_id: ctx.organizationId,
      conversation_id: ctx.conversationId,
      message_id: ctx.messageId ?? null,
      rule_id: ctx.ruleId,
      event: 'phase6_enqueue_blocked',
      action: type,
      reason,
      phase6_setting_enabled: phase6On,
    });
    emitWorkflowActionSkipped({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      ruleId: ctx.ruleId,
      actionType: type,
      reason,
      messageId: ctx.messageId,
      channelType: ctx.channelType,
    });
    return 'skipped';
  }

  emitWorkflowActionSkipped({
    organizationId: ctx.organizationId,
    conversationId: ctx.conversationId,
    ruleId: ctx.ruleId,
    actionType: type ?? 'unknown',
    reason: 'unknown_action',
    messageId: ctx.messageId,
    channelType: ctx.channelType,
  });
  return 'skipped';
}

/**
 * Apply all actions for matched rules (in rule sort order).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} [params.messageId]
 * @param {string} [params.workflowTrigger]
 * @param {number} [params.slaMinutes]
 * @param {'first_response' | 'next_response'} [params.breachType]
 * @param {Array<{ ruleId: string, name: string, actions: object[] }>} params.matched
 */
export async function applyMatchedWorkflowRules({
  organizationId,
  conversationId,
  messageId,
  workflowTrigger,
  slaMinutes,
  breachType,
  matched,
}) {
  if (!matched?.length) return { applied: 0, skipped: 0, failed: 0 };
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('channel_type, customer_id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  let customerEmail = '';
  let customerMessage = '';
  if (messageId) {
    const { data: msg } = await supabaseAdmin
      .from('messages')
      .select('content')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    customerMessage = String(msg?.content ?? '').slice(0, 500);
  }
  if (conv?.customer_id) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('email')
      .eq('id', conv.customer_id)
      .maybeSingle();
    customerEmail = customer?.email ?? '';
  }

  const channelType = conv?.channel_type ?? null;
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const rule of matched) {
    for (const action of rule.actions ?? []) {
      try {
        const outcome = await applyWorkflowAction(action, {
          organizationId,
          conversationId,
          ruleId: rule.ruleId,
          messageId,
          channelType,
          customerEmail,
          customerMessage,
          workflowTrigger,
          slaMinutes,
          breachType,
        });
        if (outcome === 'applied') applied += 1;
        else skipped += 1;
      } catch (e) {
        failed += 1;
        const reason = e instanceof HttpError ? e.message : e?.message ?? 'error';
        emitSupportEvent({
          organizationId,
          eventType: 'workflow.action_failed',
          entityType: 'conversation',
          entityId: conversationId,
          actorMemberId: null,
          channelType,
          payload: {
            rule_id: rule.ruleId,
            action_type: action.type,
            reason,
            message_id: messageId ?? null,
          },
        });
        logWorkflowEvent({
          organization_id: organizationId,
          conversation_id: conversationId,
          message_id: messageId ?? null,
          rule_id: rule.ruleId,
          event: 'action_failed',
          action: action.type,
          reason,
        });
        if (e instanceof HttpError && e.status >= 500) {
          throw e;
        }
      }
    }
  }

  try {
    const { syncConversationAssignmentRouting } = await import(
      '../assignment/assignmentInbox.service.js'
    );
    await syncConversationAssignmentRouting(organizationId, conversationId);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[assignment] workflow routing sync skipped', {
      organization_id: organizationId,
      conversation_id: conversationId,
      error: e?.message,
    });
  }

  return { applied, skipped, failed };
}
