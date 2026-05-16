import Redis from 'ioredis';
import { rateLimitConfig } from './rateLimit.config.js';

/** @type {Redis | null} */
let client = null;

/**
 * Shared Redis client for rate limits, outbound log dedupe, and future caches.
 * Returns null when `REDIS_URL` is unset.
 */
export function getRedisClient() {
  const url = rateLimitConfig.redisUrl;
  if (!url) return null;
  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    client.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[redis] connection error:', err?.message ?? err);
    });
  }
  return client;
}

/** @returns {Promise<Redis | null>} */
export async function connectRedis() {
  const redis = getRedisClient();
  if (!redis) return null;
  if (redis.status === 'ready') return redis;
  if (redis.status === 'connecting') {
    await new Promise((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
    return redis;
  }
  await redis.connect();
  return redis;
}

export async function pingRedis() {
  const redis = await connectRedis();
  if (!redis) return { ok: false, error: 'REDIS_URL not configured' };
  const pong = await redis.ping();
  return { ok: pong === 'PONG' };
}

export async function closeRedis() {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
}
