import { DEFAULT_INBOX_NAME, slugifyInboxName } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Ensure org has a default inbox; return its id.
 * @param {string} organizationId
 */
export async function ensureDefaultInboxForOrg(organizationId) {
  const existing = await getDefaultInboxId(organizationId);
  if (existing) return existing;

  const slug = slugifyInboxName(DEFAULT_INBOX_NAME);
  const { data, error } = await supabaseAdmin
    .from('inboxes')
    .insert({
      organization_id: organizationId,
      name: DEFAULT_INBOX_NAME,
      slug,
      status: 'active',
      is_default: true,
      settings: {},
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return getDefaultInboxId(organizationId);
    }
    throw new HttpError(500, error.message || 'Failed to create default inbox.');
  }
  return data?.id ?? null;
}

/**
 * @param {string} organizationId
 * @returns {Promise<string | null>}
 */
export async function getDefaultInboxId(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('inboxes')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_default', true)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) {
    const missing = error.message?.includes('inboxes') || error.code === '42P01' || error.code === 'PGRST205';
    if (missing) return null;
    throw new HttpError(500, error.message || 'Failed to load default inbox.');
  }
  return data?.id ?? null;
}

/**
 * Resolve inbox for new conversation: explicit id or org default.
 * @param {string} organizationId
 * @param {string | null | undefined} inboxId
 */
export async function resolveInboxIdForNewConversation(organizationId, inboxId = null) {
  if (inboxId) {
    const { data, error } = await supabaseAdmin
      .from('inboxes')
      .select('id, status')
      .eq('id', inboxId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message || 'Failed to validate inbox.');
    if (!data) throw new HttpError(400, 'Invalid inbox for this organization.');
    if (data.status !== 'active') throw new HttpError(400, 'Cannot assign conversations to an archived inbox.');
    return data.id;
  }
  const defaultId = await ensureDefaultInboxForOrg(organizationId);
  if (!defaultId) throw new HttpError(500, 'Default inbox is not configured for this organization.');
  return defaultId;
}
