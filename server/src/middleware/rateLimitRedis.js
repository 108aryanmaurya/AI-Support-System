import { rateLimitConfig } from '../config/rateLimit.config.js';
import { connectRedis } from '../config/redis.js';

/** Atomic fixed-window counter with TTL (milliseconds). */
const INCR_WINDOW_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

/**
 * @param {{ windowMs: number, maxRequests: number, name?: string }} options
 */
export function createRedisRateLimiter({ windowMs, maxRequests, name = 'anonymous' }) {
  const keyPrefix = rateLimitConfig.redisKeyPrefix;

  return {
    check: async (key) => {
      const redis = await connectRedis();
      if (!redis) {
        throw new Error('Redis client is not available');
      }

      const redisKey = `${keyPrefix}${name}:${key}`;
      const raw = await redis.eval(INCR_WINDOW_LUA, 1, redisKey, String(windowMs));
      const count = Number(Array.isArray(raw) ? raw[0] : 0);
      const pttl = Number(Array.isArray(raw) ? raw[1] : windowMs);
      const ttlMs = pttl > 0 ? pttl : windowMs;
      const resetAt = Date.now() + ttlMs;
      const allowed = count <= maxRequests;
      const remaining = Math.max(0, maxRequests - count);

      return {
        allowed,
        retryAfterMs: allowed ? 0 : ttlMs,
        limit: maxRequests,
        remaining,
        resetAt,
      };
    },
    pruneExpired: () => 0,
    evictOverflow: () => 0,
    getStats: () => ({
      name,
      buckets: null,
      windowMs,
      maxRequests,
      backend: 'redis',
    }),
    destroy: () => {},
  };
}
