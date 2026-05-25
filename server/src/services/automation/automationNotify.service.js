import { enqueueAutomationJob, emitAutomationJob } from './enqueueJob.service.js';
import { notifyConversationAssignee } from '../conversationAssignmentNotification.service.js';
import {
  deliverPostInboundNotification,
  schedulePostInboundNotification,
} from '../postInboundNotification.service.js';

/**
 * Enqueue staff inbound notification (falls back to direct send if queue unavailable).
 */
export function scheduleSlaWarningNotification({
  organizationId,
  conversationId,
  slaMinutes,
  channel,
  ruleId,
  idempotencyKey,
}) {
  emitAutomationJob({
    organizationId,
    jobType: 'notify.sla_warning',
    idempotencyKey,
    payload: {
      conversationId,
      slaMinutes,
      channel: channel === 'assignee' ? 'assignee' : 'staff',
      ruleId,
    },
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
