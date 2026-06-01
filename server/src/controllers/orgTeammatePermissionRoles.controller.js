import {
  createOrgTeammatePermissionRole,
  deleteOrgTeammatePermissionRole,
  listOrgTeammatePermissionRoles,
  updateOrgTeammatePermissionRole,
} from '../services/orgTeammatePermissionRoles.service.js';

export async function listOrgTeammatePermissionRolesController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    const roles = await listOrgTeammatePermissionRoles(organizationId);
    res.json({ roles });
  } catch (error) {
    next(error);
  }
}

export async function createOrgTeammatePermissionRoleController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    const role = await createOrgTeammatePermissionRole({
      organizationId,
      name: req.body?.name,
      description: req.body?.description,
      permissions: req.body?.permissions,
    });
    res.status(201).json({ role });
  } catch (error) {
    next(error);
  }
}

export async function updateOrgTeammatePermissionRoleController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    const roleId = req.params?.roleId;
    const role = await updateOrgTeammatePermissionRole({
      organizationId,
      roleId,
      name: req.body?.name,
      description: req.body?.description,
      permissions: req.body?.permissions,
    });
    res.json({ role });
  } catch (error) {
    next(error);
  }
}

export async function deleteOrgTeammatePermissionRoleController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    const roleId = req.params?.roleId;
    await deleteOrgTeammatePermissionRole(organizationId, roleId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
