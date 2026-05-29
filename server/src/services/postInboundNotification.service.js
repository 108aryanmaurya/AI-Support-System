import { supabaseAdmin } from '../config/supabase.js';
import { getOrgAssignmentSettings } from './assignment/assignmentSettings.service.js';
import {
  emailForMember,
  notifyAutoAssignedFirstTouch,
  notifyRoutingFallbackUnassigned,
  notifyStaffOfCustomerMessage,
  resolveOrgAdminNotificationEmail,
} from './customerInboundNotification.service.js';
import { enqueueAutomationJob } from './automation/enqueueJob.service.js';

/**
 * @typedef {'standard' | 'auto_assigned_first_touch' | 'routing_fallback'} PostInboundNotifyMode
 */

/**
 * Load customer message text and email for notification payloads.
 *
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {string} messageId
 */
export async function loadInboundNotifyContext(organizationId, conversationId, messageId) {
  const { data: msg, error: mErr } = await supabaseAdmin
    .from('messages')
    .select('id, content, conversation_id')
    .eq('id', messageId)
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (mErr || !msg) {
    return { customerMessage: '', customerEmail: '' };
  }

  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('customer_id, source, channel_type')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  const meta =
    msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : {};
  let channelLabel = 'api';
  if (meta.channel === 'email' || conv?.source === 'email') {
    channelLabel = 'email';
  } else if (typeof conv?.channel_type === 'string' && conv.channel_type.trim()) {
    channelLabel = conv.channel_type.trim();
  } else if (typeof conv?.source === 'string' && conv.source.trim()) {
    channelLabel = conv.source.trim();
  }

  let customerEmail = '';
  if (conv?.customer_id) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('email')
      .eq('id', conv.customer_id)
      .eq('organization_id', organizationId)
      .maybeSingle();
    customerEmail =
      typeof customer?.email === 'string' ? customer.email.trim().toLowerCase() : '';
  }

  return {
    customerMessage:
      typeof msg.content === 'string' && msg.content.trim() ? msg.content.trim() : '',
    customerEmail,
    channelLabel,
  };
}

/**
 * Resolve notification recipient emails for routing fallback (unassigned after auto-route).
 *
 * @param {string} organizationId
 */
export async function resolveRoutingFallbackRecipientEmails(organizationId) {
  const routing = await getOrgAssignmentSettings(organizationId);
  const emails = new Set();
  const fallbackIds = routing.fallback_notify_member_ids ?? [];
  let resolvedFromFallback = 0;

  for (const memberId of fallbackIds) {
    const email = await emailForMember(organizationId, memberId);
    if (email) {
      emails.add(email);
      resolvedFromFallback += 1;
    }
  }

  const usedAdminFallback = emails.size === 0;
  if (usedAdminFallback) {
    const admin = await resolveOrgAdminNotificationEmail(organizationId);
    if (admin) emails.add(admin);
  }



  return [...emails];
}

/**
 * Deliver post-routing staff notification (sync — used by worker and fallback enqueue).
 *
 * @param {object} p
 * @param {string} p.organizationId
 * @param {string} p.conversationId
 * @param {string} [p.customerMessage]
 * @param {string} [p.customerEmail]
 * @param {string} [p.channelLabel]
 * @param {PostInboundNotifyMode} [p.mode]
 * @param {string | null} [p.autoRouteReason]
 * @param {string[]} [p.primaryCodes]
 * @param {string | null} [p.assignedToMemberId]
 */
export async function deliverPostInboundNotification(p) {
  const mode = p.mode ?? 'standard';

  

  if (mode === 'auto_assigned_first_touch' && p.assignedToMemberId) {
    await notifyAutoAssignedFirstTouch({
      organizationId: p.organizationId,
      conversationId: p.conversationId,
      assignedToMemberId: p.assignedToMemberId,
      customerMessage: p.customerMessage ?? '',
      customerEmail: p.customerEmail ?? '',
      channelLabel: p.channelLabel ?? 'chat',
    });
    return;
  }

  if (mode === 'routing_fallback') {
    const recipients = await resolveRoutingFallbackRecipientEmails(p.organizationId);
    await notifyRoutingFallbackUnassigned({
      organizationId: p.organizationId,
      conversationId: p.conversationId,
      customerMessage: p.customerMessage ?? '',
      customerEmail: p.customerEmail ?? '',
      channelLabel: p.channelLabel ?? 'chat',
      autoRouteReason: p.autoRouteReason ?? 'no_candidates',
      primaryCodes: p.primaryCodes ?? [],
      recipientEmails: recipients,
    });
    return;
  }

  await notifyStaffOfCustomerMessage({
    organizationId: p.organizationId,
    conversationId: p.conversationId,
    customerMessage: p.customerMessage ?? '',
    customerEmail: p.customerEmail ?? '',
    channelLabel: p.channelLabel ?? 'chat',
  });
}

/**
 * Enqueue post-routing inbound notification (after auto-route or when auto-route was not scheduled).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.messageId
 * @param {string} [params.customerMessage]
 * @param {string} [params.customerEmail]
 * @param {string} [params.channelLabel]
 * @param {string} [params.idempotencyKey]
 * @param {PostInboundNotifyMode} [params.mode]
 * @param {string | null} [params.autoRouteReason]
 * @param {string[]} [params.primaryCodes]
 * @param {string | null} [params.assignedToMemberId]
 */
export async function schedulePostInboundNotification(params) {
  const {
    organizationId,
    conversationId,
    messageId,
    customerMessage: msgIn,
    customerEmail: emailIn,
    channelLabel = 'chat',
    idempotencyKey,
    mode = 'standard',
    autoRouteReason = null,
    primaryCodes = [],
    assignedToMemberId = null,
  } = params;

  if (!organizationId || !conversationId || !messageId) return;

  let customerMessage = msgIn ?? '';
  let customerEmail = emailIn ?? '';
  let resolvedChannel = channelLabel;
  if (!customerMessage || !customerEmail || resolvedChannel === 'routing' || resolvedChannel === 'chat') {
    const ctx = await loadInboundNotifyContext(organizationId, conversationId, messageId);
    if (!customerMessage) customerMessage = ctx.customerMessage;
    if (!customerEmail) customerEmail = ctx.customerEmail;
    if (resolvedChannel === 'routing' || resolvedChannel === 'chat') {
      resolvedChannel = ctx.channelLabel ?? resolvedChannel;
    }
  }

  const key =
    idempotencyKey ??
    `post-inbound:${organizationId}:${messageId}:${mode}:${assignedToMemberId ?? 'x'}`;

  const result = await enqueueAutomationJob({
    organizationId,
    jobType: 'notify.staff_inbound',
    idempotencyKey: key,
    payload: {
      conversationId,
      messageId,
      customerMessage,
      customerEmail,
      channelLabel: resolvedChannel,
      mode,
      autoRouteReason,
      primaryCodes,
      assignedToMemberId,
    },
  });

  if (
    result.skipped &&
    (result.reason === 'automation_table_missing' || result.reason === 'enqueue_error')
  ) {
    await deliverPostInboundNotification({
      organizationId,
      conversationId,
      customerMessage,
      customerEmail,
      channelLabel: resolvedChannel,
      mode,
      autoRouteReason,
      primaryCodes,
      assignedToMemberId,
    });
  }
}
