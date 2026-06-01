/**
 * Org-scoped named permission templates (Teammates → Roles).
 * Stored on invites / inbox_members.permissions as templateRoleId + templateRoleName.
 */

import { mergeInboxMemberPermissions } from './inboxMemberPermissions.js';

export const CUSTOM_PERMISSION_ROLE_NAME = 'Custom';

export const MAX_ORG_PERMISSION_ROLE_NAME_LENGTH = 64;

export const MAX_ORG_PERMISSION_ROLE_DESCRIPTION_LENGTH = 500;

export const MAX_ORG_PERMISSION_ROLES_PER_ORG = 50;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} name
 */
export function normalizeOrgPermissionRoleName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().slice(0, MAX_ORG_PERMISSION_ROLE_NAME_LENGTH);
}

/**
 * @param {unknown} name
 */
export function isValidOrgPermissionRoleName(name) {
  const n = normalizeOrgPermissionRoleName(name);
  if (!n) return false;
  if (n.toLowerCase() === CUSTOM_PERMISSION_ROLE_NAME.toLowerCase()) return false;
  return true;
}

/**
 * @param {unknown} description
 */
export function normalizeOrgPermissionRoleDescription(description) {
  if (typeof description !== 'string') return '';
  return description.trim().slice(0, MAX_ORG_PERMISSION_ROLE_DESCRIPTION_LENGTH);
}

/**
 * @param {unknown} description
 */
export function isValidOrgPermissionRoleDescription(description) {
  return normalizeOrgPermissionRoleDescription(description).length > 0;
}

/**
 * @param {unknown} id
 */
export function isValidOrgPermissionRoleId(id) {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

/**
 * @param {unknown} raw
 */
export function parsePermissionTemplateMeta(raw) {
  const merged = mergeInboxMemberPermissions(raw);
  return {
    templateRoleId: merged.templateRoleId ?? null,
    templateRoleName: merged.templateRoleName ?? CUSTOM_PERMISSION_ROLE_NAME,
  };
}

/**
 * Attach template metadata to merged permissions for persistence.
 * @param {object} permissions — merged inbox member permissions
 * @param {{ templateRoleId?: string | null, templateRoleName?: string }} meta
 */
export function withPermissionTemplateMeta(permissions, meta = {}) {
  const merged = mergeInboxMemberPermissions(permissions);
  const templateRoleId =
    meta.templateRoleId && isValidOrgPermissionRoleId(meta.templateRoleId)
      ? meta.templateRoleId.trim()
      : null;
  const templateRoleName = templateRoleId
    ? normalizeOrgPermissionRoleName(meta.templateRoleName) ||
      merged.templateRoleName ||
      CUSTOM_PERMISSION_ROLE_NAME
    : CUSTOM_PERMISSION_ROLE_NAME;
  return {
    ...merged,
    templateRoleId,
    templateRoleName,
  };
}

/**
 * @param {unknown} a
 * @param {unknown} b
 */
export function inboxMemberPermissionsEqual(a, b) {
  const left = mergeInboxMemberPermissions(a);
  const right = mergeInboxMemberPermissions(b);
  return JSON.stringify(left) === JSON.stringify(right);
}
