import { hasOrgPermission } from '@ai-support/shared';
import { getActiveMembership } from '../services/org.service.js';
import { getOrgPermissionsForMember } from '../services/orgPermissions.service.js';

const DEFAULT_ORG_ID_KEYS = ['organizationId', 'orgId'];

function pickOrganizationId(req, keys) {
  for (const key of keys) {
    const fromParams = req.params?.[key];
    if (fromParams) return String(fromParams).trim();

    const fromBody = req.body?.[key];
    if (fromBody != null && String(fromBody).trim()) return String(fromBody).trim();

    const fromQuery = req.query?.[key];
    if (fromQuery != null && String(fromQuery).trim()) return String(fromQuery).trim();
  }
  return null;
}

/**
 * Ensures the authenticated user has an ACTIVE membership for an organization.
 *
 * Default (recommended for `/api/org/:orgId/**`): reads **only** `req.params.orgId`
 * so organization scope cannot be overridden via query/body.
 *
 * Options:
 * - `paramKey` (default `'orgId'`) — URL segment under `/api/org/:orgId`.
 * - `allowFallback` — if true, also checks params.organizationId, body, query (legacy).
 *
 * Sets:
 * - `req.orgId`
 * - `req.organizationId` (alias)
 * - `req.orgMembership`
 *
 * Requires {@link requireAuth} first (`req.user` / `req.userId`).
 */
export function requireOrgAccess(options = {}) {
  const paramKey = options.paramKey ?? 'orgId';
  const allowFallback = options.allowFallback === true;
  const fallbackKeys = options.organizationIdKeys ?? DEFAULT_ORG_ID_KEYS;

  return async function requireOrgAccessMiddleware(req, res, next) {
    try {
      const uid = req.userId ?? req.user?.id;
      if (!uid) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      let organizationId =
        req.params?.[paramKey] != null ? String(req.params[paramKey]).trim() : '';

      if (!organizationId && allowFallback) {
        organizationId = pickOrganizationId(req, fallbackKeys) ?? '';
      }

      if (!organizationId) {
        res.status(400).json({ error: 'orgId is required in the URL path.' });
        return;
      }

      const membership = await getActiveMembership({
        userId: uid,
        organizationId,
      });

      if (!membership) {
        res.status(403).json({ error: 'You do not have access to this organization.' });
        return;
      }

      req.orgMembership = membership;
      req.orgId = organizationId;
      req.organizationId = organizationId;
      req.userId = uid;
      req.orgPermissions = await getOrgPermissionsForMember(organizationId, membership);

      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Explicit alias for URL-param-only org scope (same as default {@link requireOrgAccess}). */
export const requireOrgParamAccess = requireOrgAccess();

/**
 * Legacy ADMIN/AGENT gate — disabled until `organization_members.permissions` is enforced.
 * @deprecated Use {@link requirePermission} when capability checks are wired to member JSON.
 */
export function requireRole(..._allowedRoles) {
  return function requireRoleMiddleware(_req, _res, next) {
    next();
  };
}

/**
 * Capability gate from `organization_members.permissions` (via {@link getOrgPermissionsForMember}).
 *
 * @param {...string} permissionKeys — e.g. `team.invite`, `conversations.mark_spam`
 */
export function requirePermission(...permissionKeys) {
  return async function requirePermissionMiddleware(req, res, next) {
    try {
      // const perms =
      //   req.orgPermissions ??
      //   (await getOrgPermissionsForMember(req.orgId ?? req.organizationId, req.orgMembership));

      // for (const key of permissionKeys) {
      //   if (!hasOrgPermission(perms, key)) {
      //     res.status(403).json({ error: 'Insufficient permissions for this action.' });
      //     return;
      //   }
      // }
      next();
    } catch (e) {
      next(e);
    }
  };
}
