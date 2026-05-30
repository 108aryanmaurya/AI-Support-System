/**
 * Org RBAC capabilities in `organizations.settings.permissions`.
 * Role presets: ADMIN (all org-scoped) vs AGENT (restricted defaults).
 */

export const ORG_PERMISSIONS_AGENT_DEFAULTS = Object.freeze({
  conversations: Object.freeze({
    view_all: true,
    view_unassigned: true,
    assign_self: true,
    assign_others: false,
    unassign: false,
    close: true,
    mark_spam: false,
    merge: false,
    transfer_inbox: false,
    view_all_inboxes: false,
  }),
  inboxes: Object.freeze({
    manage: false,
  }),
  messages: Object.freeze({
    reply: true,
    internal_note: true,
    retry_failed: true,
  }),
  ai: Object.freeze({
    use_copilot: true,
    manage_settings: false,
    manage_workflows: false,
    enable_autonomous: false,
  }),
  automation: Object.freeze({
    manage_assignment: false,
    manage_sla: false,
    view_logs: false,
  }),
  team: Object.freeze({
    invite: false,
    manage_members: false,
    configure_permissions: false,
  }),
  analytics: Object.freeze({
    view_org: false,
    view_self: true,
    export: false,
  }),
  channels: Object.freeze({
    manage_email: false,
    manage_webhooks: false,
  }),
});

/** All org-scoped capabilities enabled (platform secrets remain server-only). */
export const ORG_PERMISSIONS_ADMIN_DEFAULTS = Object.freeze({
  conversations: Object.freeze({
    view_all: true,
    view_unassigned: true,
    assign_self: true,
    assign_others: true,
    unassign: true,
    close: true,
    mark_spam: true,
    merge: true,
    transfer_inbox: true,
    view_all_inboxes: true,
  }),
  inboxes: Object.freeze({
    manage: true,
  }),
  messages: Object.freeze({
    reply: true,
    internal_note: true,
    retry_failed: true,
  }),
  ai: Object.freeze({
    use_copilot: true,
    manage_settings: true,
    manage_workflows: true,
    enable_autonomous: true,
  }),
  automation: Object.freeze({
    manage_assignment: true,
    manage_sla: true,
    view_logs: true,
  }),
  team: Object.freeze({
    invite: true,
    manage_members: true,
    configure_permissions: true,
  }),
  analytics: Object.freeze({
    view_org: true,
    view_self: true,
    export: true,
  }),
  channels: Object.freeze({
    manage_email: true,
    manage_webhooks: true,
  }),
});

const PERMISSION_SECTIONS = Object.keys(ORG_PERMISSIONS_AGENT_DEFAULTS);

/**
 * @param {unknown} defaults
 * @param {unknown} overrides
 */
function mergeSection(defaults, overrides) {
  const base = defaults && typeof defaults === 'object' ? defaults : {};
  const src = overrides && typeof overrides === 'object' ? overrides : {};
  const out = { ...base };
  for (const key of Object.keys(base)) {
    if (typeof src[key] === 'boolean') {
      out[key] = src[key];
    }
  }
  return out;
}

/**
 * @param {unknown} raw — `organizations.settings.permissions`
 * @param {typeof ORG_PERMISSIONS_AGENT_DEFAULTS} roleDefaults
 */
export function mergeOrgPermissions(raw, roleDefaults = ORG_PERMISSIONS_AGENT_DEFAULTS) {
  const src = raw && typeof raw === 'object' ? raw : {};
  /** @type {Record<string, Record<string, boolean>>} */
  const merged = {};
  for (const section of PERMISSION_SECTIONS) {
    merged[section] = mergeSection(roleDefaults[section], src[section]);
  }
  return merged;
}

/**
 * @param {'ADMIN' | 'AGENT' | string | null | undefined} role
 */
export function permissionsForRole(role) {
  const r = typeof role === 'string' ? role.trim().toUpperCase() : '';
  if (r === 'ADMIN') {
    return mergeOrgPermissions({}, ORG_PERMISSIONS_ADMIN_DEFAULTS);
  }
  return mergeOrgPermissions({}, ORG_PERMISSIONS_AGENT_DEFAULTS);
}

/**
 * Dot-path permission check, e.g. `conversations.assign_others`.
 *
 * @param {unknown} permissions — merged permissions object
 * @param {string} key
 */
export function hasOrgPermission(permissions, key) {
  if (!key || typeof key !== 'string') return false;
  const parts = key.split('.').filter(Boolean);
  if (!parts.length) return false;
  let cur = permissions;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return false;
    cur = cur[part];
  }
  return cur === true;
}

/**
 * @param {unknown} permissions
 * @param {string[]} keys — all must be true
 */
export function hasAllOrgPermissions(permissions, keys) {
  return keys.every((k) => hasOrgPermission(permissions, k));
}
