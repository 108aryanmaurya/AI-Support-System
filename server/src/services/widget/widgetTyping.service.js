import { widgetConfig } from '../../config/widget.config.js';

/** @type {import('ioredis').default | null} */
let redis = null;

async function getRedis() {
  if (redis) return redis;
  const { rateLimitConfig } = await import('../../config/rateLimit.config.js');
  const Redis = (await import('ioredis')).default;
  redis = new Redis(rateLimitConfig.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  await redis.connect().catch(() => {
    redis = null;
  });
  return redis;
}

export async function setWidgetTyping({ conversationId, visitorId, typing }) {
  const client = await getRedis();
  if (!client) return;
  const key = `widget:typing:customer:${conversationId}`;
  if (typing) {
    await client.set(key, visitorId, 'EX', widgetConfig.rateLimits.typingTtlSec);
  } else {
    await client.del(key);
  }
}

export async function setAgentTyping({ conversationId, memberId, typing }) {
  const client = await getRedis();
  if (!client) return;
  const key = `widget:typing:agent:${conversationId}`;
  if (typing) {
    await client.set(key, memberId || '1', 'EX', widgetConfig.rateLimits.typingTtlSec);
  } else {
    await client.del(key);
  }
}

export async function getWidgetTyping(conversationId) {
  const client = await getRedis();
  if (!client) return false;
  const val = await client.get(`widget:typing:agent:${conversationId}`);
  return Boolean(val);
}
