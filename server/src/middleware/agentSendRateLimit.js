import { rateLimitConfig } from '../config/rateLimit.config.js';
import { rateLimitMiddleware } from './rateLimitFactory.js';

const { agentSend } = rateLimitConfig;

/**
 * Authenticated agent outbound sends — per org + user (burst / abuse protection).
 */
export const agentSendRateLimit = rateLimitMiddleware({
  name: 'agent.send',
  windowMs: agentSend.windowMs,
  maxRequests: agentSend.max,
  skipWhenNoKey: true,
  message: 'Too many outbound messages. Please wait before sending again.',
  getKey: (req) => {
    const orgId = req.orgId ?? req.params?.orgId;
    const userId = req.user?.id ?? req.userId;
    if (!orgId || !userId) return null;
    return `send:org:${orgId}:user:${userId}`;
  },
});
