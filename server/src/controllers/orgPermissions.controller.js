import { HttpError } from '../utils/httpError.js';
import { getCurrentMemberPermissionsPayload } from '../services/currentMemberPermissions.service.js';
import { getOrgPermissionsSettings, patchOrgSettings } from '../services/orgSettings.service.js';
import { emitSupportEvent } from '../services/analytics/supportEvents.service.js';

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
  return id;
}

export async function getOrgPermissionsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const membershipId = req.orgMembership?.id;
    if (!membershipId) {
      throw new HttpError(403, 'You do not have access to this organization.');
    }

    const payload = await getCurrentMemberPermissionsPayload(organizationId, membershipId);
    const canEdit = Boolean(
      payload.permissions?.team?.configure_permissions === true ||
        payload.permissions?.team?.invite === true,
    );

    res.json({
      ...payload,
      canEdit,
    });
  } catch (e) {
    next(e);
  }
}

export async function patchOrgPermissionsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const body = req.body ?? {};
    const permissionsPatch = body.permissions;
    if (!permissionsPatch || typeof permissionsPatch !== 'object') {
      throw new HttpError(400, 'permissions object is required.');
    }

    const saved = await patchOrgSettings(organizationId, { permissions: permissionsPatch });
    const role = req.orgMembership?.role ?? 'ADMIN';
    const effective = await getOrgPermissionsSettings(organizationId, role);

    emitSupportEvent({
      organizationId,
      eventType: 'permissions.updated',
      entityType: 'organization',
      entityId: organizationId,
      actorMemberId: req.orgMembership?.id ?? null,
      payload: { sections: Object.keys(permissionsPatch) },
    });

    res.json({ permissions: effective, saved: saved.permissions ?? null });
  } catch (e) {
    next(e);
  }
}
