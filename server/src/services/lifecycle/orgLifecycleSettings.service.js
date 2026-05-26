import { buildLifecycleSettingsPatch, mergeOrgLifecycleSettings } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';

async function loadSettingsRow(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, settings')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load organization settings.');
  }
  if (!data) {
    throw new HttpError(404, 'Organization not found.');
  }
  return data;
}

/**
 * @param {string} organizationId
 */
export async function getOrgLifecycleSettingsForAdmin(organizationId) {
  const row = await loadSettingsRow(organizationId);
  const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  return mergeOrgLifecycleSettings(settings.lifecycle);
}

/**
 * @param {string} organizationId
 * @param {unknown} body
 */
export async function putOrgLifecycleSettings(organizationId, body) {
  const patch = buildLifecycleSettingsPatch(body);
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, 'No valid lifecycle settings fields provided.');
  }

  const row = await loadSettingsRow(organizationId);
  const priorSettings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  const priorLifecycle =
    priorSettings.lifecycle && typeof priorSettings.lifecycle === 'object'
      ? { ...priorSettings.lifecycle }
      : {};

  const nextLifecycle = { ...priorLifecycle, ...patch };
  const nextSettings = {
    ...priorSettings,
    lifecycle: nextLifecycle,
  };

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ settings: nextSettings })
    .eq('id', organizationId);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to save lifecycle settings.');
  }

  return { lifecycle: mergeOrgLifecycleSettings(nextLifecycle) };
}
