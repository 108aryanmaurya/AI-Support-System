import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';

/**
 * Ensure org has an active web channel row for widget conversations.
 * @param {string} organizationId
 */
export async function ensureWebChannelForOrg(organizationId) {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from('channels')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('type', 'web')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (findErr) {
    throw new HttpError(500, findErr.message || 'Failed to resolve web channel.');
  }
  if (existing?.id) return existing.id;

  const { data: created, error: createErr } = await supabaseAdmin
    .from('channels')
    .insert({
      organization_id: organizationId,
      type: 'web',
      name: 'Web chat',
      is_active: true,
    })
    .select('id')
    .single();

  if (createErr) {
    if (createErr.code === '23514') {
      // Legacy DB: channels.type check was email-only until 20260603130000_channels_type_allow_web.sql
      console.warn(
        '[widget] Could not insert web channel (channels_type_check). Conversations will use channel_type=web without channel_id until migration is applied.',
      );
      return null;
    }
    throw new HttpError(500, createErr.message || 'Failed to create web channel.');
  }
  return created.id;
}
