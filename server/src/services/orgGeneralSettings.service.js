import {
  generalSettingsFromOrgSettings,
  normalizeOrgTimezone,
  organizationAppId,
} from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

async function loadOrganizationRow(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name, settings')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load organization.');
  }
  if (!data) {
    throw new HttpError(404, 'Organization not found.');
  }
  return data;
}

function buildWorkspaceGeneralPatch(priorSettings, nextGeneral) {
  const prior =
    priorSettings && typeof priorSettings === 'object' ? { ...priorSettings } : {};
  const priorWorkspace =
    prior.workspace && typeof prior.workspace === 'object' ? { ...prior.workspace } : {};

  return {
    ...prior,
    workspace: {
      ...priorWorkspace,
      general: {
        timezone: nextGeneral.timezone,
        disable_team_mentions_in_notes: nextGeneral.disable_team_mentions_in_notes,
        hide_csat_scores_from_agents: nextGeneral.hide_csat_scores_from_agents,
        ...(nextGeneral.deletion_requested_at
          ? { deletion_requested_at: nextGeneral.deletion_requested_at }
          : {}),
      },
    },
  };
}

/**
 * @param {string} organizationId
 */
export async function getOrgGeneralSettings(organizationId) {
  const row = await loadOrganizationRow(organizationId);
  const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  const general = generalSettingsFromOrgSettings(settings);

  return {
    organizationId: row.id,
    name: typeof row.name === 'string' ? row.name : '',
    appId: organizationAppId(row.id),
    general: {
      timezone: general.timezone,
      disable_team_mentions_in_notes: general.disable_team_mentions_in_notes,
      hide_csat_scores_from_agents: general.hide_csat_scores_from_agents,
    },
    deletionRequestedAt: general.deletion_requested_at,
  };
}

/**
 * @param {string} organizationId
 * @param {{ name?: string, timezone?: string, disable_team_mentions_in_notes?: boolean, hide_csat_scores_from_agents?: boolean }} input
 */
export async function patchOrgGeneralSettings(organizationId, input = {}) {
  const row = await loadOrganizationRow(organizationId);
  const priorSettings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  const priorGeneral = generalSettingsFromOrgSettings(priorSettings);

  const nextGeneral = { ...priorGeneral };

  if (typeof input.timezone === 'string') {
    nextGeneral.timezone = normalizeOrgTimezone(input.timezone);
  }
  if (typeof input.disable_team_mentions_in_notes === 'boolean') {
    nextGeneral.disable_team_mentions_in_notes = input.disable_team_mentions_in_notes;
  }
  if (typeof input.hide_csat_scores_from_agents === 'boolean') {
    nextGeneral.hide_csat_scores_from_agents = input.hide_csat_scores_from_agents;
  }

  const nextSettings = buildWorkspaceGeneralPatch(priorSettings, nextGeneral);

  const updates = { settings: nextSettings };

  if (typeof input.name === 'string') {
    const trimmed = input.name.trim();
    if (!trimmed) throw new HttpError(400, 'Workspace name is required.');
    if (trimmed.length > 256) throw new HttpError(400, 'Workspace name is too long.');
    updates.name = trimmed;
  }

  const { error } = await supabaseAdmin
    .from('organizations')
    .update(updates)
    .eq('id', organizationId);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to save workspace settings.');
  }

  return getOrgGeneralSettings(organizationId);
}

function normalizeFullName(s) {
  return typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Schedules workspace deletion (14-day window stored as timestamp).
 *
 * @param {string} organizationId
 * @param {string} userId
 * @param {string} confirmFullName
 */
export async function requestOrganizationDeletion(organizationId, userId, confirmFullName) {
  const row = await loadOrganizationRow(organizationId);
  const { data: user, error: uErr } = await supabaseAdmin
    .from('users')
    .select('first_name, last_name')
    .eq('id', userId)
    .maybeSingle();

  if (uErr) {
    throw new HttpError(500, uErr.message || 'Failed to load user profile.');
  }

  const expected = normalizeFullName(
    [user?.first_name, user?.last_name].filter(Boolean).join(' '),
  );
  const provided = normalizeFullName(confirmFullName);

  if (!expected) {
    throw new HttpError(
      400,
      'Your account must have a first and last name set before you can delete a workspace.',
    );
  }
  if (!provided || provided.toLowerCase() !== expected.toLowerCase()) {
    throw new HttpError(400, 'Full name does not match your account.');
  }

  const priorSettings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  const priorGeneral = generalSettingsFromOrgSettings(priorSettings);

  if (priorGeneral.deletion_requested_at) {
    throw new HttpError(409, 'Workspace deletion is already scheduled.');
  }

  const deletion_requested_at = new Date().toISOString();
  const nextSettings = buildWorkspaceGeneralPatch(priorSettings, {
    ...priorGeneral,
    deletion_requested_at,
  });

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ settings: nextSettings })
    .eq('id', organizationId);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to schedule workspace deletion.');
  }

  return {
    deletionRequestedAt: deletion_requested_at,
    message:
      'Workspace deletion confirmed. This workspace will be deleted within 14 days of confirmation.',
  };
}
