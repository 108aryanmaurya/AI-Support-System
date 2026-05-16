/**
 * Express rate-limit middleware — Redis-backed only (see rateLimitRedis.js).
 */

import { rateLimitConfig } from '../config/rateLimit.config.js';
import { createRedisRateLimiter } from './rateLimitRedis.js';

export { createRedisRateLimiter as createRateLimiter };

/**
 * @param {import('express').Response} res
 * @param {{ limit: number, remaining: number, resetAt: number }} meta
 */
function setRateLimitHeaders(res, meta) {
  res.setHeader('X-RateLimit-Limit', String(meta.limit));
  res.setHeader('X-RateLimit-Remaining', String(meta.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(meta.resetAt / 1000)));
}

/**
 * @param {object} options
 * @param {(req: import('express').Request) => string | null | undefined} options.getKey
 * @param {number} options.windowMs
 * @param {number} options.maxRequests
 * @param {string} [options.name]
 * @param {string} [options.message]
 * @param {boolean} [options.skipWhenNoKey]
 */
export function rateLimitMiddleware({
  getKey,
  windowMs,
  maxRequests,
  name = 'default',
  message = 'Too many requests.',
  skipWhenNoKey = false,
}) {
  const limiter = createRedisRateLimiter({ windowMs, maxRequests, name });

  return async function rateLimit(req, res, next) {
    const key = getKey(req);
    if (!key) {
      if (skipWhenNoKey) return next();
      return res.status(429).json({ error: message });
    }

    try {
      const result = await limiter.check(key);
      setRateLimitHeaders(res, result);

      if (!result.allowed) {
        if (result.retryAfterMs > 0) {
          res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
        }
        return res.status(429).json({ error: message });
      }
      return next();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[rate-limit] ${name} redis error:`, err?.message ?? err);
      if (rateLimitConfig.redisFailClosed) {
        return res.status(503).json({ error: 'Service temporarily unavailable.' });
      }
      return next();
    }
  };
}
