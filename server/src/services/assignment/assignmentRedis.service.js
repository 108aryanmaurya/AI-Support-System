import { connectRedis } from '../../config/redis.js';
import { assignmentConfig } from '../../config/assignment.config.js';
import { logAssignmentStructured } from './assignmentStructuredLog.service.js';

function prefixKey(suffix) {
  return `${assignmentConfig.redisKeyPrefix}${suffix}`;
}

export function presenceRedisKey(organizationId, memberId) {
  return prefixKey(`presence:${organizationId}:${memberId}`);
}

export function activeChatsRedisKey(organizationId, memberId) {
  return prefixKey(`active_chats:${organizationId}:${memberId}`);
}

export function conversationLockRedisKey(conversationId) {
  return prefixKey(`lock:conversation:${conversationId}`);
}

/**
 * @param {string} conversationId
 * @param {{ organizationId?: string }} [ctx]
 * @returns {Promise<boolean>} true if lock acquired
 */
export async function acquireConversationAssignmentLock(conversationId, ctx = {}) {
  const redis = await connectRedis();
  if (!redis) return false;
  const key = conversationLockRedisKey(conversationId);
  const result = await redis.set(
    key,
    '1',
    'EX',
    assignmentConfig.conversationLockTtlSec,
    'NX',
  );
  if (result !== 'OK') {
    logAssignmentStructured('warn', {
      organization_id: ctx.organizationId ?? null,
      conversation_id: conversationId,
      error_code: 'lock_held',
      op: 'acquire_lock',
    });
  }
  return result === 'OK';
}

/**
 * @param {string} conversationId
 */
export async function releaseConversationAssignmentLock(conversationId) {
  const redis = await connectRedis();
  if (!redis) return;
  await redis.del(conversationLockRedisKey(conversationId));
}

/**
 * @returns {Promise<boolean>}
 */
export async function isAssignmentRedisAvailable() {
  try {
    const redis = await connectRedis();
    return Boolean(redis && redis.status === 'ready');
  } catch {
    return false;
  }
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 * @param {string} presence
 */
export async function setPresenceInRedis(organizationId, memberId, presence) {
  const redis = await connectRedis();
  if (!redis) return false;
  const key = presenceRedisKey(organizationId, memberId);
  await redis.set(key, presence, 'EX', assignmentConfig.presenceTtlSec);
  return true;
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 * @returns {Promise<string | null>}
 */
export async function getPresenceFromRedis(organizationId, memberId) {
  const redis = await connectRedis();
  if (!redis) return null;
  const v = await redis.get(presenceRedisKey(organizationId, memberId));
  return typeof v === 'string' ? v : null;
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 * @param {number} count
 */
export async function setActiveChatsInRedis(organizationId, memberId, count) {
  const redis = await connectRedis();
  if (!redis) return false;
  const n = Math.max(0, Math.round(Number(count) || 0));
  const key = activeChatsRedisKey(organizationId, memberId);
  await redis.set(key, String(n), 'EX', assignmentConfig.activeChatsTtlSec);
  return true;
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 * @returns {Promise<number | null>} null when Redis unavailable
 */
export async function getActiveChatsFromRedis(organizationId, memberId) {
  const redis = await connectRedis();
  if (!redis) return null;
  const v = await redis.get(activeChatsRedisKey(organizationId, memberId));
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/**
 * @param {string} organizationId
 * @param {string[]} memberIds
 * @returns {Promise<Map<string, { presence: string | null, activeChats: number | null }>>}
 */
export async function getAssignmentRedisSnapshot(organizationId, memberIds) {
  const map = new Map();
  for (const id of memberIds) {
    map.set(id, { presence: null, activeChats: null });
  }
  const redis = await connectRedis();
  if (!redis || memberIds.length === 0) return map;

  const presenceKeys = memberIds.map((id) => presenceRedisKey(organizationId, id));
  const chatKeys = memberIds.map((id) => activeChatsRedisKey(organizationId, id));
  const [presenceVals, chatVals] = await Promise.all([
    redis.mget(...presenceKeys),
    redis.mget(...chatKeys),
  ]);

  memberIds.forEach((id, i) => {
    const chatsRaw = chatVals[i];
    let activeChats = null;
    if (chatsRaw != null) {
      const n = Number(chatsRaw);
      activeChats = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    }
    map.set(id, {
      presence: typeof presenceVals[i] === 'string' ? presenceVals[i] : null,
      activeChats,
    });
  });

  return map;
}
