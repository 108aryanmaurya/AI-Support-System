/**
 * `users.profile` JSON for teammate public profile UI.
 */

export const TEAMMATE_BIO_MAX_LENGTH = 160;

export const TEAMMATE_PROFILE_DEFAULTS = Object.freeze({
  location: '',
  timezone: '',
  hide_location_from_users: false,
  alias: '',
  hide_identity_from_users: false,
  department: '',
  phone: '',
  bio: '',
  calendar_url: '',
  hide_calendar_from_users: false,
});

/**
 * @param {unknown} raw
 */
export function mergeTeammateProfile(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const bio =
    typeof src.bio === 'string' ? src.bio.trim().slice(0, TEAMMATE_BIO_MAX_LENGTH) : '';
  return {
    location: typeof src.location === 'string' ? src.location.trim().slice(0, 120) : '',
    timezone: typeof src.timezone === 'string' ? src.timezone.trim().slice(0, 64) : '',
    hide_location_from_users: src.hide_location_from_users === true,
    alias: typeof src.alias === 'string' ? src.alias.trim().slice(0, 64) : '',
    hide_identity_from_users: src.hide_identity_from_users === true,
    department: typeof src.department === 'string' ? src.department.trim().slice(0, 120) : '',
    phone: typeof src.phone === 'string' ? src.phone.trim().slice(0, 32) : '',
    bio,
    calendar_url: typeof src.calendar_url === 'string' ? src.calendar_url.trim().slice(0, 512) : '',
    hide_calendar_from_users: src.hide_calendar_from_users === true,
  };
}

/**
 * @param {unknown} patch
 */
export function buildTeammateProfilePatch(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const src = /** @type {Record<string, unknown>} */ (patch);
  const out = {};
  const keys = Object.keys(TEAMMATE_PROFILE_DEFAULTS);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const merged = mergeTeammateProfile({ [key]: src[key] });
    out[key] = merged[key];
  }
  return out;
}
