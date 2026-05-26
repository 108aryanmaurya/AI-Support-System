import {
  CONVERSATION_ACTIVE_STATUSES,
  isConversationTerminalStatus,
  mergeOrgLifecycleSettings,
} from '@ai-support/shared';

export { isConversationTerminalStatus as isTerminalStatus };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {string | Date | null | undefined} iso
 * @returns {number | null}
 */
function daysSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / MS_PER_DAY;
}

/**
 * @param {unknown} status
 * @returns {boolean}
 */
export function isActiveConversationStatus(status) {
  return typeof status === 'string' && CONVERSATION_ACTIVE_STATUSES.includes(status);
}

/**
 * Whether a customer inbound should reopen a terminal conversation (Model C).
 *
 * @param {object} params
 * @param {object} params.conversation — row with `status`, `closed_at`, `last_message_at`
 * @param {'email'|'web'} params.channel
 * @param {object} [params.payload]
 * @param {boolean} [params.payload.threadMatched] — email thread / In-Reply-To hit
 * @param {unknown} [params.orgSettings] — lifecycle slice or full org settings
 * @returns {boolean}
 */
export function shouldReopenConversation({ conversation, channel, payload = {}, orgSettings }) {
  if (!conversation || !isConversationTerminalStatus(conversation.status)) {
    return false;
  }

  const lifecycle = mergeOrgLifecycleSettings(
    orgSettings && typeof orgSettings === 'object' && 'lifecycle' in orgSettings
      ? orgSettings.lifecycle
      : orgSettings,
  );

  if (!lifecycle.reopen_on_customer_message) {
    return false;
  }

  if (channel === 'email' && payload.threadMatched !== true) {
    return false;
  }

  if (conversation.status === 'closed') {
    const maxDays = lifecycle.new_conversation_after_closed_days;
    const anchor = conversation.closed_at ?? conversation.last_message_at;
    const ageDays = daysSince(anchor);
    if (ageDays !== null && ageDays > maxDays) {
      return false;
    }
  }

  return true;
}

/**
 * Email webhook reopen decision (no I/O). Mirrors `maybeReopenEmailThreadConversation`.
 *
 * @param {object} params
 * @param {object|null|undefined} params.conversation
 * @param {string|null|undefined} params.matchedBy — `findOrCreateEmailThread` result (`new` skips reopen)
 * @param {unknown} [params.orgSettings]
 * @returns {{ shouldReopen: boolean, reason: string }}
 */
export function evaluateEmailThreadReopenDecision({ conversation, matchedBy, orgSettings }) {
  if (!conversation?.id || matchedBy === 'new') {
    return { shouldReopen: false, reason: 'new_thread' };
  }
  if (!isConversationTerminalStatus(conversation.status)) {
    return { shouldReopen: false, reason: 'not_terminal' };
  }
  const shouldReopen = shouldReopenConversation({
    conversation,
    channel: 'email',
    payload: { threadMatched: true },
    orgSettings,
  });
  return {
    shouldReopen,
    reason: shouldReopen ? 'customer_reply_email' : 'policy_blocked',
  };
}
