import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Returns the super-organization for a user who creates workspaces.
 * Invite-only users do not get a super_organization until they create an org.
 *
 * @param {string} userId
 * @returns {Promise<string>}
 */
export async function getOrCreateSuperOrganizationForUser(userId) {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from('super_organizations')
    .select('id')
    .eq('created_by', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    const msg = typeof findErr.message === 'string' ? findErr.message : '';
    if (msg.includes('super_organizations') && msg.includes('schema cache')) {
      throw new HttpError(
        503,
        'Database migration required: run supabase/migrations/20260601150000_super_organizations.sql',
      );
    }
    throw new HttpError(500, findErr.message || 'Failed to resolve super organization.');
  }

  if (existing?.id) return existing.id;

  const { data: created, error: insErr } = await supabaseAdmin
    .from('super_organizations')
    .insert({ created_by: userId })
    .select('id')
    .single();

  if (insErr || !created?.id) {
    if (insErr?.code === '23505') {
      const { data: retry } = await supabaseAdmin
        .from('super_organizations')
        .select('id')
        .eq('created_by', userId)
        .limit(1)
        .maybeSingle();
      if (retry?.id) return retry.id;
    }
    throw new HttpError(500, insErr?.message || 'Failed to create super organization.');
  }

  return created.id;
}
