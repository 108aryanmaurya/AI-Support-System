import { rateLimitConfig } from '../config/rateLimit.config.js';
import { normalizeEmail } from '../utils/incomingMessageValidation.js';
import { rateLimitMiddleware } from './rateLimitFactory.js';

const { incoming } = rateLimitConfig;

const orgLimiter = rateLimitMiddleware({
  name: 'ingress.org',
  windowMs: incoming.orgWindowMs,
  maxRequests: incoming.orgMax,
  skipWhenNoKey: true,
  message: 'Too many requests for this organization.',
  getKey: (req) => {
    const organizationId =
      typeof req.params?.orgId === 'string'
        ? req.params.orgId.trim()
        : typeof req.body?.organizationId === 'string'
          ? req.body.organizationId.trim()
          : '';
    return organizationId ? `ingress:org:${organizationId}` : null;
  },
});

const emailLimiter = rateLimitMiddleware({
  name: 'ingress.email',
  windowMs: incoming.emailWindowMs,
  maxRequests: incoming.emailMax,
  skipWhenNoKey: true,
  message: 'Too many requests for this customer email.',
  getKey: (req) => {
    const organizationId =
      typeof req.params?.orgId === 'string'
        ? req.params.orgId.trim()
        : typeof req.body?.organizationId === 'string'
          ? req.body.organizationId.trim()
          : '';
    const email = normalizeEmail(req.body?.customer?.email);
    if (!organizationId || !email) return null;
    return `ingress:org:${organizationId}:email:${email}`;
  },
});

/** Public customer ingress: per-org and per-org+email caps. */
export function incomingMessageRateLimit(req, res, next) {
  orgLimiter(req, res, (orgErr) => {
    if (orgErr) return next(orgErr);
    emailLimiter(req, res, next);
  });
}
