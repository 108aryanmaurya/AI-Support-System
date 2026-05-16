import { enqueueAutomationJob, emitAutomationJob } from './enqueueJob.service.js';
import { notifyStaffOfCustomerMessage } from '../customerInboundNotification.service.js';
import { notifyConversationAssignee } from '../conversationAssignmentNotification.service.js';

/**
 * Enqueue staff inbound notification (falls back to direct send if queue unavailable).
 */
export function scheduleStaffInboundNotification({
  organizationId,
  conversationId,
  customerMessage,
  customerEmail,
  channelLabel,
  idempotencyKey,
}) {
  emitAutomationJob({
    organizationId,
    jobType: 'notify.staff_inbound',
    idempotencyKey,
    payload: {
      conversationId,
      customerMessage,
      customerEmail,
      channelLabel,
    },
  });
}

/**
 * Sync fallback when migration not applied — used by schedule* if enqueue returns table_missing.
 */
export async function fallbackStaffInboundNotification(params) {
  await notifyStaffOfCustomerMessage(params);
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
 * Try enqueue; on missing table run handler inline once.
 */
export async function scheduleStaffInboundWithFallback(params) {
  const key =
    params.idempotencyKey ??
    `inbound:${params.organizationId}:${params.conversationId}:${params.messageId ?? 'x'}`;

  const result = await enqueueAutomationJob({
    organizationId: params.organizationId,
    jobType: 'notify.staff_inbound',
    idempotencyKey: key,
    payload: {
      conversationId: params.conversationId,
      customerMessage: params.customerMessage,
      customerEmail: params.customerEmail,
      channelLabel: params.channelLabel,
    },
  });

  if (result.reason === 'automation_table_missing' || result.reason === 'enqueue_error') {
    await fallbackStaffInboundNotification(params);
  }
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
