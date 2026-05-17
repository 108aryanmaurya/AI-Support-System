import { rateLimitConfig } from '../config/rateLimit.config.js';
import { rateLimitMiddleware } from './rateLimitFactory.js';

const { knowledge } = rateLimitConfig;

/** Org-scoped knowledge search — per organization. */
export const orgKnowledgeSearchRateLimit = rateLimitMiddleware({
  name: 'knowledge.search_org',
  windowMs: knowledge.searchOrgWindowMs,
  maxRequests: knowledge.searchOrgMax,
  message: 'Too many knowledge searches for this workspace.',
  getKey: (req) => {
    const orgId = req.orgId ?? req.params?.orgId;
    return orgId ? `knowledge:search:org:${orgId}` : null;
  },
});

/** Per-user cap within org for search. */
export const orgKnowledgeSearchUserRateLimit = rateLimitMiddleware({
  name: 'knowledge.search_user',
  windowMs: knowledge.searchOrgWindowMs,
  maxRequests: knowledge.searchOrgUserMax,
  skipWhenNoKey: true,
  message: 'Too many knowledge searches for your account.',
  getKey: (req) => {
    const orgId = req.orgId ?? req.params?.orgId;
    const userId = req.user?.id ?? req.userId;
    if (!orgId || !userId) return null;
    return `knowledge:search:org:${orgId}:user:${userId}`;
  },
});

export function knowledgeSearchRateLimit(req, res, next) {
  orgKnowledgeSearchRateLimit(req, res, (err) => {
    if (err) return next(err);
    orgKnowledgeSearchUserRateLimit(req, res, next);
  });
}

/** Org-scoped file upload — per organization. */
export const orgKnowledgeUploadRateLimit = rateLimitMiddleware({
  name: 'knowledge.upload_org',
  windowMs: knowledge.uploadOrgWindowMs,
  maxRequests: knowledge.uploadOrgMax,
  message: 'Too many knowledge uploads for this workspace.',
  getKey: (req) => {
    const orgId = req.orgId ?? req.params?.orgId;
    return orgId ? `knowledge:upload:org:${orgId}` : null;
  },
});

export const orgKnowledgeUploadUserRateLimit = rateLimitMiddleware({
  name: 'knowledge.upload_user',
  windowMs: knowledge.uploadOrgWindowMs,
  maxRequests: knowledge.uploadOrgUserMax,
  skipWhenNoKey: true,
  message: 'Too many knowledge uploads for your account.',
  getKey: (req) => {
    const orgId = req.orgId ?? req.params?.orgId;
    const userId = req.user?.id ?? req.userId;
    if (!orgId || !userId) return null;
    return `knowledge:upload:org:${orgId}:user:${userId}`;
  },
});

export function knowledgeUploadRateLimit(req, res, next) {
  orgKnowledgeUploadRateLimit(req, res, (err) => {
    if (err) return next(err);
    orgKnowledgeUploadUserRateLimit(req, res, next);
  });
}
