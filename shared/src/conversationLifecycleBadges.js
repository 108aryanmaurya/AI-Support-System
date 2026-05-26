/**
 * Inbox list badges for conversation lifecycle status (Sprint 5+).
 */

import { getConversationWaitingStatus } from './conversationWaitingStatus.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {unknown} conversation
 * @returns {boolean}
 */
export function isReopenedConversation(conversation) {
  if (!conversation || typeof conversation !== 'object') return false;
  const status = conversation.status;
  if (status !== 'open' && status !== 'pending') {
    return false;
  }
  const meta = conversation.metadata;
  if (!meta || typeof meta !== 'object') return false;
  const lifecycle = /** @type {Record<string, unknown>} */ (meta).lifecycle;
  return Boolean(lifecycle && typeof lifecycle === 'object' && lifecycle.reopened_at);
}

/**
 * @param {unknown} conversation
 * @returns {Array<{ id: string, label: string, tone: 'warning' | 'info' | 'neutral' | 'success' }>}
 */
export function getConversationLifecycleListBadges(conversation) {
  const badges = [];
  if (!conversation || typeof conversation !== 'object') return badges;

  const status = conversation.status;
  const waitingStatus = getConversationWaitingStatus(conversation);

  if (status === 'resolved') {
    badges.push({ id: 'lifecycle_resolved', label: 'Resolved', tone: 'success' });
  }
  if (waitingStatus === 'waiting_customer') {
    badges.push({ id: 'lifecycle_waiting_customer', label: 'Waiting on customer', tone: 'info' });
  }
  if (waitingStatus === 'waiting_agent') {
    badges.push({ id: 'lifecycle_waiting_agent', label: 'Waiting on agent', tone: 'warning' });
  }
  if (isReopenedConversation(conversation)) {
    badges.push({ id: 'lifecycle_reopened', label: 'Reopened', tone: 'info' });
  }

  return badges;
}

/**
 * Sidebar/detail hint for auto-close timers (requires merged org lifecycle settings).
 *
 * @param {unknown} conversation
 * @param {unknown} lifecycleSettings — merged org lifecycle defaults
 * @returns {string|null}
 */
export function getConversationLifecycleDetailHint(conversation, lifecycleSettings) {
  if (!conversation || typeof conversation !== 'object') return null;
  if (!lifecycleSettings || typeof lifecycleSettings !== 'object') return null;
  if (!lifecycleSettings.enabled) return null;

  const status = conversation.status;
  const waitingStatus = getConversationWaitingStatus(conversation);
  const now = Date.now();

  if (status === 'resolved') {
    const days = Number(lifecycleSettings.resolved_auto_close_days) || 14;
    const anchor =
      conversation.last_message_at ?? conversation.resolved_at ?? conversation.created_at;
    if (!anchor) return `Auto-closes after ${days} days without activity when lifecycle is enabled.`;
    const closesAt = new Date(anchor).getTime() + days * MS_PER_DAY;
    const remainingMs = closesAt - now;
    if (remainingMs <= 0) return 'Eligible for auto-close on the next lifecycle scan.';
    const remainingDays = Math.max(1, Math.ceil(remainingMs / MS_PER_DAY));
    return `Closes in ~${remainingDays} day${remainingDays === 1 ? '' : 's'} if there is no activity.`;
  }

  if (waitingStatus === 'waiting_customer') {
    const reminderDays = Number(lifecycleSettings.waiting_reminder_days) || 3;
    const closeAfterDays =
      Number(lifecycleSettings.waiting_auto_close_after_reminder_days) || 7;

    if (conversation.customer_reminder_sent_at) {
      const sentAt = new Date(conversation.customer_reminder_sent_at).getTime();
      const closesAt = sentAt + closeAfterDays * MS_PER_DAY;
      const remainingMs = closesAt - now;
      if (remainingMs <= 0) {
        return 'Eligible to close after reminder if the customer does not reply.';
      }
      const remainingDays = Math.max(1, Math.ceil(remainingMs / MS_PER_DAY));
      return `Closes in ~${remainingDays} day${remainingDays === 1 ? '' : 's'} if there is still no reply after the reminder.`;
    }

    const anchor =
      conversation.last_customer_message_at ??
      conversation.last_agent_message_at ??
      conversation.last_message_at;
    if (anchor && lifecycleSettings.customer_reminder_enabled !== false) {
      const reminderAt = new Date(anchor).getTime() + reminderDays * MS_PER_DAY;
      const remainingMs = reminderAt - now;
      if (remainingMs > 0) {
        const remainingDays = Math.max(1, Math.ceil(remainingMs / MS_PER_DAY));
        return `Customer reminder in ~${remainingDays} day${remainingDays === 1 ? '' : 's'} if they stay silent.`;
      }
      return 'Customer reminder is due on the next lifecycle scan.';
    }

    return `Reminder after ${reminderDays} days without a customer reply (when email is configured).`;
  }

  if (waitingStatus === 'waiting_agent') {
    return 'Customer replied — awaiting agent response.';
  }

  return null;
}
