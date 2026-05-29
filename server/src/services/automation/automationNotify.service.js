import { slaBreachNotifyIdempotencyKey } from '@ai-support/shared';
import { enqueueAutomationJob, emitAutomationJob } from './enqueueJob.service.js';
import {
  notifyConversationAssignee,
  notifyConversationPriorAssigneeUnassigned,
} from '../conversationAssignmentNotification.service.js';
import { notifyStaffOfSlaWarning } from '../slaWarningNotification.service.js';
import {
  deliverPostInboundNotification,
  schedulePostInboundNotification,
} from '../postInboundNotification.service.js';

/**
 * Dedicated SLA breach email (scan path or workflow `notify` action).
 */
export async function scheduleSlaBreachNotification({
  organizationId,
  conversationId,
  slaMinutes,
  breachType = 'first_response',
  source = 'scan',
  channel = 'staff',
  ruleId = null,
  idempotencyKey = null,
}) {
  const resolvedBreachType = breachType === 'next_response' ? 'next_response' : 'first_response';
  const day = new Date().toISOString().slice(0, 10);
  const key =
    idempotencyKey ??
    slaBreachNotifyIdempotencyKey(organizationId, conversationId, resolvedBreachType, day);

  const result = await enqueueAutomationJob({
    organizationId,
    jobType: 'notify.sla_warning',
    idempotencyKey: key,
    payload: {
      conversationId,
      slaMinutes,
      breachType: resolvedBreachType,
      source,
      channel: channel === 'assignee' ? 'assignee' : 'staff',
      ruleId,
    },
  });

  if (result.reason === 'automation_table_missing' || result.reason === 'enqueue_error') {
    await notifyStaffOfSlaWarning({
      organizationId,
      conversationId,
      slaMinutes,
      breachType: resolvedBreachType,
      source,
      channel: channel === 'assignee' ? 'assignee' : 'staff',
    });
  }
}

/** @deprecated Prefer {@link scheduleSlaBreachNotification}. */
export function scheduleSlaWarningNotification(params) {
  void scheduleSlaBreachNotification({
    organizationId: params.organizationId,
    conversationId: params.conversationId,
    slaMinutes: params.slaMinutes,
    breachType: 'first_response',
    source: 'workflow',
    channel: params.channel,
    ruleId: params.ruleId,
    idempotencyKey: params.idempotencyKey,
  });
}

export function scheduleStaffInboundNotification({
  organizationId,
  conversationId,
  messageId = null,
  customerMessage,
  customerEmail,
  channelLabel,
  idempotencyKey,
  mode = 'standard',
}) {
  void schedulePostInboundNotification({
    organizationId,
    conversationId,
    messageId,
    customerMessage,
    customerEmail,
    channelLabel,
    idempotencyKey,
    mode,
  });
}

/**
 * Sync fallback when migration not applied — used by schedule* if enqueue returns table_missing.
 */
export async function fallbackStaffInboundNotification(params) {
  await deliverPostInboundNotification({
    organizationId: params.organizationId,
    conversationId: params.conversationId,
    customerMessage: params.customerMessage ?? '',
    customerEmail: params.customerEmail ?? '',
    channelLabel: params.channelLabel ?? 'chat',
    mode: params.mode ?? 'standard',
    autoRouteReason: params.autoRouteReason ?? null,
    primaryCodes: params.primaryCodes ?? [],
    assignedToMemberId: params.assignedToMemberId ?? null,
  });
}

export function scheduleAssignmentNotification({
  organizationId,
  conversation,
  conversationId,
  assignedToMemberId,
  actorUserId,
  priorAssignedToMemberId,
}) {
  const convId = conversation?.id ?? conversationId;
  const memberId = assignedToMemberId ?? conversation?.assigned_to_member_id;
  if (!memberId) return;

  const key = `assign:${organizationId}:${convId}:${memberId}`;

  emitAutomationJob({
    organizationId,
    jobType: 'notify.assignment',
    idempotencyKey: key,
    payload: {
      conversationId: convId,
      conversation,
      assignedToMemberId: memberId,
      actorUserId,
      priorAssignedToMemberId,
    },
  });
}

export async function fallbackAssignmentNotification(params) {
  await notifyConversationAssignee(params);
}

export async function fallbackUnassignmentNotification(params) {
  await notifyConversationPriorAssigneeUnassigned({
    organizationId: params.organizationId,
    conversation: params.conversation,
    priorAssignedToMemberId: params.priorAssignedToMemberId ?? null,
    assignedToMemberId: params.assignedToMemberId ?? params.conversation?.assigned_to_member_id ?? null,
    actorUserId: params.actorUserId ?? null,
  });
}

export async function scheduleUnassignmentWithFallback(params) {
  const convId = params.conversation?.id;
  const priorId = params.priorAssignedToMemberId ?? null;
  const newId = params.assignedToMemberId ?? params.conversation?.assigned_to_member_id ?? null;

  if (!priorId || priorId === newId) return;

  const result = await enqueueAutomationJob({
    organizationId: params.organizationId,
    jobType: 'notify.unassignment',
    idempotencyKey: `unassign:${params.organizationId}:${convId}:${priorId}:${newId ?? 'none'}`,
    payload: {
      conversationId: convId,
      conversation: params.conversation,
      priorAssignedToMemberId: priorId,
      assignedToMemberId: newId,
      actorUserId: params.actorUserId ?? null,
    },
  });

  if (result.reason === 'automation_table_missing' || result.reason === 'enqueue_error') {
    await fallbackUnassignmentNotification(params);
  }
}

/**
 * @deprecated Prefer {@link schedulePostInboundNotification} after routing. Kept for workflow notify actions.
 */
export async function scheduleStaffInboundWithFallback(params) {
  await schedulePostInboundNotification({
    organizationId: params.organizationId,
    conversationId: params.conversationId,
    messageId: params.messageId,
    customerMessage: params.customerMessage,
    customerEmail: params.customerEmail,
    channelLabel: params.channelLabel,
    idempotencyKey: params.idempotencyKey,
    mode: params.mode ?? 'standard',
    autoRouteReason: params.autoRouteReason ?? null,
    primaryCodes: params.primaryCodes ?? [],
    assignedToMemberId: params.assignedToMemberId ?? null,
  });
}

export async function scheduleAssignmentWithFallback(params) {
  await scheduleUnassignmentWithFallback(params);

  const convId = params.conversation?.id;
  const memberId = params.assignedToMemberId ?? params.conversation?.assigned_to_member_id;
  if (!memberId || memberId === params.priorAssignedToMemberId) return;

  const result = await enqueueAutomationJob({
    organizationId: params.organizationId,
    jobType: 'notify.assignment',
    idempotencyKey: `assign:${params.organizationId}:${convId}:${memberId}`,
    payload: {
      conversationId: convId,
      conversation: params.conversation,
      assignedToMemberId: memberId,
      actorUserId: params.actorUserId,
      priorAssignedToMemberId: params.priorAssignedToMemberId,
    },
  });

  if (result.reason === 'automation_table_missing' || result.reason === 'enqueue_error') {
    await fallbackAssignmentNotification(params);
  }
}
