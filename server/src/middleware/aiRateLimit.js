import { rateLimitConfig } from '../config/rateLimit.config.js';
import { rateLimitMiddleware } from './rateLimitFactory.js';

const { ai } = rateLimitConfig;

/** Global `/api/ai/*` — per authenticated user (legacy stub routes). */
export const globalAiUserRateLimit = rateLimitMiddleware({
  name: 'ai.global_user',
  windowMs: ai.userWindowMs,
  maxRequests: ai.userMax,
  skipWhenNoKey: true,
  message: 'Too many AI requests. Try again shortly.',
  getKey: (req) => {
    const userId = req.user?.id ?? req.userId;
    return userId ? `ai:user:${userId}` : null;
  },
});

/** Org-scoped `/api/org/:orgId/ai/*` — per organization. */
export const orgAiRateLimit = rateLimitMiddleware({
  name: 'ai.org',
  windowMs: ai.orgWindowMs,
  maxRequests: ai.orgMax,
  message: 'Too many AI requests for this workspace.',
  getKey: (req) => {
    const orgId = req.orgId ?? req.params?.orgId;
    return orgId ? `ai:org:${orgId}` : null;
  },
});

/** Org-scoped AI — per user within org (tighter cap for LLM cost control). */
export const orgAiUserRateLimit = rateLimitMiddleware({
  name: 'ai.org_user',
  windowMs: ai.orgWindowMs,
  maxRequests: ai.orgUserMax,
  skipWhenNoKey: true,
  message: 'Too many AI requests for your account in this workspace.',
  getKey: (req) => {
    const orgId = req.orgId ?? req.params?.orgId;
    const userId = req.user?.id ?? req.userId;
    if (!orgId || !userId) return null;
    return `ai:org:${orgId}:user:${userId}`;
  },
});

/** Chain org + org-user limits for a single route. */
export function orgAiAssistRateLimit(req, res, next) {
  orgAiRateLimit(req, res, (err) => {
    if (err) return next(err);
    orgAiUserRateLimit(req, res, next);
  });
}
