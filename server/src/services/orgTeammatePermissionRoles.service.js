import {
  isValidOrgPermissionRoleDescription,
  isValidOrgPermissionRoleId,
  isValidOrgPermissionRoleName,
  MAX_ORG_PERMISSION_ROLES_PER_ORG,
  mergeInboxMemberPermissions,
  normalizeOrgPermissionRoleDescription,
  normalizeOrgPermissionRoleName,
} from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

function mapRoleRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: normalizeOrgPermissionRoleDescription(row.description),
    permissions: mergeInboxMemberPermissions(row.permissions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listOrgTeammatePermissionRoles(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('org_teammate_permission_roles')
    .select('id, name, description, permissions, created_at, updated_at')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true });

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load permission roles.');
  }

  return (data ?? []).map(mapRoleRow);
}

export async function getOrgTeammatePermissionRole(organizationId, roleId) {
  if (!isValidOrgPermissionRoleId(roleId)) {
    throw new HttpError(400, 'Invalid role id.');
  }

  const { data, error } = await supabaseAdmin
    .from('org_teammate_permission_roles')
    .select('id, name, description, permissions, created_at, updated_at')
    .eq('organization_id', organizationId)
    .eq('id', roleId.trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load permission role.');
  }
  if (!data) throw new HttpError(404, 'Permission role not found.');
  return mapRoleRow(data);
}

export async function createOrgTeammatePermissionRole({
  organizationId,
  name,
  description,
  permissions,
}) {
  const roleName = normalizeOrgPermissionRoleName(name);
  if (!isValidOrgPermissionRoleName(roleName)) {
    throw new HttpError(400, 'A valid role name is required (1–64 characters).');
  }

  const roleDescription = normalizeOrgPermissionRoleDescription(description);
  if (!isValidOrgPermissionRoleDescription(roleDescription)) {
    throw new HttpError(400, 'A role description is required (1–500 characters).');
  }

  const mergedPermissions = mergeInboxMemberPermissions(permissions);

  const { count, error: countErr } = await supabaseAdmin
    .from('org_teammate_permission_roles')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  if (countErr) {
    throw new HttpError(500, countErr.message || 'Failed to check role limit.');
  }
  if ((count ?? 0) >= MAX_ORG_PERMISSION_ROLES_PER_ORG) {
    throw new HttpError(400, `Maximum ${MAX_ORG_PERMISSION_ROLES_PER_ORG} roles per workspace.`);
  }

  const { data, error } = await supabaseAdmin
    .from('org_teammate_permission_roles')
    .insert({
      organization_id: organizationId,
      name: roleName,
      description: roleDescription,
      permissions: mergedPermissions,
    })
    .select('id, name, description, permissions, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'A role with this name already exists.');
    }
    throw new HttpError(500, error.message || 'Failed to create permission role.');
  }

  return mapRoleRow(data);
}

export async function updateOrgTeammatePermissionRole({
  organizationId,
  roleId,
  name,
  description,
  permissions,
}) {
  if (!isValidOrgPermissionRoleId(roleId)) {
    throw new HttpError(400, 'Invalid role id.');
  }

  const patch = { updated_at: new Date().toISOString() };
  if (name !== undefined) {
    const roleName = normalizeOrgPermissionRoleName(name);
    if (!isValidOrgPermissionRoleName(roleName)) {
      throw new HttpError(400, 'A valid role name is required (1–64 characters).');
    }
    patch.name = roleName;
  }
  if (description !== undefined) {
    const roleDescription = normalizeOrgPermissionRoleDescription(description);
    if (!isValidOrgPermissionRoleDescription(roleDescription)) {
      throw new HttpError(400, 'A role description is required (1–500 characters).');
    }
    patch.description = roleDescription;
  }
  if (permissions !== undefined) {
    patch.permissions = mergeInboxMemberPermissions(permissions);
  }

  const { data, error } = await supabaseAdmin
    .from('org_teammate_permission_roles')
    .update(patch)
    .eq('organization_id', organizationId)
    .eq('id', roleId.trim())
    .select('id, name, description, permissions, created_at, updated_at')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'A role with this name already exists.');
    }
    throw new HttpError(500, error.message || 'Failed to update permission role.');
  }
  if (!data) throw new HttpError(404, 'Permission role not found.');
  return mapRoleRow(data);
}

export async function deleteOrgTeammatePermissionRole(organizationId, roleId) {
  if (!isValidOrgPermissionRoleId(roleId)) {
    throw new HttpError(400, 'Invalid role id.');
  }

  const { error } = await supabaseAdmin
    .from('org_teammate_permission_roles')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', roleId.trim());

  if (error) {
    throw new HttpError(500, error.message || 'Failed to delete permission role.');
  }
}
