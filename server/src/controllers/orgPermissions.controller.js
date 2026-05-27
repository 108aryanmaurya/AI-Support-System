import { hasOrgPermission } from '@ai-support/shared';
import { HttpError } from '../utils/httpError.js';
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
    const role = req.orgMembership?.role ?? 'AGENT';
    const permissions = await getOrgPermissionsSettings(organizationId, role);
    const canEdit = hasOrgPermission(req.orgPermissions, 'team.configure_permissions');
    res.json({ permissions, role, canEdit });
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
