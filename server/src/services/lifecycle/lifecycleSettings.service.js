import { mergeOrgLifecycleSettingsFromOrg } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';

/**
 * @param {string} organizationId
 * @returns {Promise<import('@ai-support/shared').ORG_LIFECYCLE_SETTINGS_DEFAULTS>}
 */
export async function getOrgLifecycleSettings(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load organization settings.');
  }
  if (!data) {
    throw new HttpError(404, 'Organization not found.');
  }

  const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  return mergeOrgLifecycleSettingsFromOrg(settings);
}
