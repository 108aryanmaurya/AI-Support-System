import { HttpError } from '../utils/httpError.js';
import { assertOrgPermission } from '../services/orgPermissions.service.js';
import {
  getTeammateProfileBundle,
  patchTeammateProfile,
} from '../services/teammateProfile.service.js';

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing.');
  return id;
}

/**
 * GET /api/org/:orgId/members/:memberId/profile
 */
export async function getTeammateProfileController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const memberId = req.params?.memberId;
    if (!memberId) throw new HttpError(400, 'memberId is required.');

    const bundle = await getTeammateProfileBundle(organizationId, memberId);
    res.json(bundle);
  } catch (e) {
    next(e);
  }
}

/**
 * PATCH /api/org/:orgId/members/:memberId/profile
 */
export async function patchTeammateProfileController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const memberId = req.params?.memberId;
    if (!memberId) throw new HttpError(400, 'memberId is required.');

    const actorUserId = req.userId ?? req.user?.id;
    const isSelf = req.orgMembership?.id === memberId;

    if (!isSelf) {
      await assertOrgPermission(organizationId, req.orgMembership, 'team.manage_members');
    }

    const bundle = await patchTeammateProfile(
      organizationId,
      memberId,
      actorUserId,
      isSelf,
      req.body ?? {},
    );
    res.json(bundle);
  } catch (e) {
    next(e);
  }
}
