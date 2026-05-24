import { rateLimitConfig } from '../config/rateLimit.config.js';
import { rateLimitMiddleware } from './rateLimitFactory.js';

const { assignment } = rateLimitConfig;

/** Cap expensive eligibility preview per org (Sprint 8+). */
export const orgAssignmentPreviewRateLimit = rateLimitMiddleware({
  name: 'assignment_preview_org',
  windowMs: assignment.previewOrgWindowMs,
  maxRequests: assignment.previewOrgMax,
  message: 'Too many assignment preview requests for this organization.',
  getKey: (req) => {
    const orgId = req.orgId ?? req.organizationId;
    return orgId ? `assignment_preview:org:${orgId}` : null;
  },
});
