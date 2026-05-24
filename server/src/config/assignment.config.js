import { ASSIGNMENT_PRESENCE_DEFAULTS } from '@ai-support/shared';

const presenceTtl = Number(process.env.ASSIGNMENT_PRESENCE_TTL_SEC);
const activeChatsTtl = Number(process.env.ASSIGNMENT_ACTIVE_CHATS_TTL_SEC);
const conversationLockTtl = Number(process.env.ASSIGNMENT_CONVERSATION_LOCK_TTL_SEC);

export const assignmentConfig = Object.freeze({
  redisKeyPrefix: (process.env.ASSIGNMENT_REDIS_KEY_PREFIX || 'asmt:').trim(),
  presenceTtlSec:
    Number.isFinite(presenceTtl) && presenceTtl > 0
      ? Math.min(600, Math.round(presenceTtl))
      : ASSIGNMENT_PRESENCE_DEFAULTS.presenceTtlSec,
  /** Safety TTL on workload counter keys (re-synced from DB on changes / heartbeat). */
  activeChatsTtlSec:
    Number.isFinite(activeChatsTtl) && activeChatsTtl > 0
      ? Math.min(86400, Math.round(activeChatsTtl))
      : 86_400,
  conversationLockTtlSec:
    Number.isFinite(conversationLockTtl) && conversationLockTtl > 0
      ? Math.min(120, Math.round(conversationLockTtl))
      : 15,
});
