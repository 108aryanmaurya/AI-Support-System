import { rateLimitConfig } from '../config/rateLimit.config.js';
import { rateLimitMiddleware } from './rateLimitFactory.js';

const { inbox } = rateLimitConfig;

export const inboxAdminRateLimit = rateLimitMiddleware({
  name: 'inbox_admin',
  windowMs: inbox.adminWindowMs,
  maxRequests: inbox.adminMax,
  message: 'Too many inbox admin requests for this organization.',
  getKey: (req) => {
    const orgId = req.orgId ?? req.organizationId;
    return orgId ? `inbox_admin:org:${orgId}` : null;
  },
});

export const inboxTransferRateLimit = rateLimitMiddleware({
  name: 'inbox_transfer',
  windowMs: inbox.transferWindowMs,
  maxRequests: inbox.transferMax,
  message: 'Too many inbox transfer requests.',
  getKey: (req) => {
    const orgId = req.orgId ?? req.organizationId;
    const userId = req.userId ?? req.user?.id;
    return orgId && userId ? `inbox_transfer:org:${orgId}:user:${userId}` : null;
  },
});
