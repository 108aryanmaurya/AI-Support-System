import { rateLimitConfig } from '../config/rateLimit.config.js';
import { rateLimitMiddleware } from './rateLimitFactory.js';

const { webhookEmail } = rateLimitConfig;

/**
 * Limit inbound email webhooks per recipient address (abuse / loop protection).
 * Skips when payload is not yet parseable (controller returns 400).
 */
export const emailWebhookRateLimit = rateLimitMiddleware({
  name: 'webhook.email',
  windowMs: webhookEmail.windowMs,
  maxRequests: webhookEmail.max,
  skipWhenNoKey: true,
  message: 'Too many inbound emails for this address.',
  getKey: (req) => {
    const to =
      req.body?.to ??
      req.body?.recipient ??
      req.body?.data?.to ??
      req.body?.data?.recipient;
    if (typeof to === 'string' && to.trim()) {
      return `webhook:email:${to.trim().toLowerCase()}`;
    }
    if (Array.isArray(to) && to[0]) {
      return `webhook:email:${String(to[0]).trim().toLowerCase()}`;
    }
    return null;
  },
});
