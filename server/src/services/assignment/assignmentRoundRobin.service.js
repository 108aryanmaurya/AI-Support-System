import { connectRedis } from '../../config/redis.js';
import { assignmentConfig } from '../../config/assignment.config.js';

function prefixKey(suffix) {
  return `${assignmentConfig.redisKeyPrefix}${suffix}`;
}

export function roundRobinRedisKey(organizationId, inboxId) {
  return prefixKey(`rr:${organizationId}:${inboxId}`);
}

/**
 * Deterministic tie-break among tied member ids (sorted), using Redis counter.
 *
 * @param {string} organizationId
 * @param {string} inboxId
 * @param {string[]} tiedMemberIds
 * @returns {Promise<string>}
 */
export async function pickRoundRobinWinner(organizationId, inboxId, tiedMemberIds) {
  const sorted = [...new Set(tiedMemberIds)].sort();
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return sorted[0];

  const redis = await connectRedis();
  if (!redis) {
    return sorted[0];
  }

  const key = roundRobinRedisKey(organizationId, inboxId);
  const idx = await redis.incr(key);
  await redis.expire(key, 60 * 60 * 24 * 14);
  return sorted[idx % sorted.length];
}

/**
 * Round-robin ordering for `round_robin` strategy (all eligible).
 *
 * @param {string} organizationId
 * @param {string} inboxId
 * @param {string[]} eligibleMemberIds
 */
export async function orderMembersRoundRobin(organizationId, inboxId, eligibleMemberIds) {
  const sorted = [...new Set(eligibleMemberIds)].sort();
  if (sorted.length <= 1) return sorted;

  const redis = await connectRedis();
  if (!redis) return sorted;

  const key = roundRobinRedisKey(organizationId, inboxId);
  const startIdx = Number(await redis.get(key)) || 0;
  const offset = startIdx % sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}

/**
 * Advance round-robin cursor after a winner is selected.
 *
 * @param {string} organizationId
 * @param {string} inboxId
 * @param {string} winnerMemberId
 * @param {string[]} eligibleSorted
 */
export async function advanceRoundRobinCursor(
  organizationId,
  inboxId,
  winnerMemberId,
  eligibleSorted,
) {
  const redis = await connectRedis();
  if (!redis) return;
  const idx = eligibleSorted.indexOf(winnerMemberId);
  if (idx < 0) return;
  const key = roundRobinRedisKey(organizationId, inboxId);
  await redis.set(key, String((idx + 1) % eligibleSorted.length), 'EX', 60 * 60 * 24 * 14);
}
