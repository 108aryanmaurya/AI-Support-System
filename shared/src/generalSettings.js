/**
 * Workspace general settings in `organizations.settings.workspace.general`.
 */

export const ORG_GENERAL_SETTINGS_DEFAULTS = Object.freeze({
  /** IANA time zone for time-dependent features. */
  timezone: 'America/Los_Angeles',
  /** When true, teammates cannot @mention teams in notes and internal conversations. */
  disable_team_mentions_in_notes: false,
  /** When true, agents do not see CSAT scores in the inbox. */
  hide_csat_scores_from_agents: false,
});

const MAX_TIMEZONE_LENGTH = 64;

/**
 * Short public-style app id derived from organization UUID (stable, copy-friendly).
 * @param {string | null | undefined} organizationId
 */
export function organizationAppId(organizationId) {
  if (typeof organizationId !== 'string' || !organizationId.trim()) return '';
  return organizationId.replace(/-/g, '').slice(0, 8).toLowerCase();
}

/**
 * Raw general blob from full org settings (prefers `workspace.general`, legacy `general`).
 * @param {unknown} settings — full `organizations.settings`
 */
export function workspaceGeneralRawFromOrgSettings(settings) {
  const src = settings && typeof settings === 'object' ? settings : {};
  const workspace = src.workspace && typeof src.workspace === 'object' ? src.workspace : {};
  if (workspace.general !== undefined) {
    return workspace.general;
  }
  return src.general;
}

/**
 * @param {unknown} raw — `organizations.settings.workspace.general`
 */
export function mergeOrgGeneralSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const timezoneRaw = typeof src.timezone === 'string' ? src.timezone.trim() : '';
  const timezone =
    timezoneRaw.length > 0 && timezoneRaw.length <= MAX_TIMEZONE_LENGTH
      ? timezoneRaw
      : ORG_GENERAL_SETTINGS_DEFAULTS.timezone;

  return {
    timezone,
    disable_team_mentions_in_notes:
      typeof src.disable_team_mentions_in_notes === 'boolean'
        ? src.disable_team_mentions_in_notes
        : ORG_GENERAL_SETTINGS_DEFAULTS.disable_team_mentions_in_notes,
    hide_csat_scores_from_agents:
      typeof src.hide_csat_scores_from_agents === 'boolean'
        ? src.hide_csat_scores_from_agents
        : ORG_GENERAL_SETTINGS_DEFAULTS.hide_csat_scores_from_agents,
    deletion_requested_at:
      typeof src.deletion_requested_at === 'string' && src.deletion_requested_at.trim()
        ? src.deletion_requested_at.trim()
        : null,
  };
}

/**
 * @param {unknown} settings — full `organizations.settings`
 */
export function generalSettingsFromOrgSettings(settings) {
  return mergeOrgGeneralSettings(workspaceGeneralRawFromOrgSettings(settings));
}

/**
 * @param {unknown} timezone
 */
export function normalizeOrgTimezone(timezone) {
  const t = typeof timezone === 'string' ? timezone.trim() : '';
  if (!t || t.length > MAX_TIMEZONE_LENGTH) {
    return ORG_GENERAL_SETTINGS_DEFAULTS.timezone;
  }
  return t;
}
