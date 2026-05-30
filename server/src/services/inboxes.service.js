import {
  INBOX_LIMITS,
  isInboxMemberRole,
  isInboxStatus,
  mergeInboxSettings,
  slugifyInboxName,
} from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { ensureDefaultInboxForOrg } from './inboxDefault.service.js';

function normalizeInboxRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    isDefault: Boolean(row.is_default),
    settings: mergeInboxSettings(row.settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {string} organizationId
 * @param {object} [options]
 * @param {string[]} [options.accessibleInboxIds] — when set, filter to these ids
 * @param {boolean} [options.viewAll]
 */
export async function listInboxes(organizationId, options = {}) {
  let q = supabaseAdmin
    .from('inboxes')
    .select('id, organization_id, name, slug, status, is_default, settings, created_at, updated_at')
    .eq('organization_id', organizationId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  const { accessibleInboxIds, viewAll } = options;
  if (!viewAll && accessibleInboxIds?.length) {
    q = q.in('id', accessibleInboxIds);
  } else if (!viewAll && Array.isArray(accessibleInboxIds) && accessibleInboxIds.length === 0) {
    return [];
  }

  const { data, error } = await q;
  if (error) {
    const missing = error.message?.includes('inboxes') || error.code === '42P01';
    if (missing) return [];
    throw new HttpError(500, error.message || 'Failed to list inboxes.');
  }
  return (data ?? []).map(normalizeInboxRow);
}

/**
 * @param {object} params
 */
export async function createInbox({ organizationId, name, memberIds = [] }) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new HttpError(400, 'Inbox name is required.');
  if (trimmed.length > INBOX_LIMITS.maxNameLength) {
    throw new HttpError(400, `Inbox name must be at most ${INBOX_LIMITS.maxNameLength} characters.`);
  }

  const { count, error: countErr } = await supabaseAdmin
    .from('inboxes')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  if (countErr) throw new HttpError(500, countErr.message || 'Failed to count inboxes.');
  if ((count ?? 0) >= INBOX_LIMITS.maxInboxes) {
    throw new HttpError(400, `Maximum ${INBOX_LIMITS.maxInboxes} inboxes per organization.`);
  }

  let slug = slugifyInboxName(trimmed);
  const { data: existing } = await supabaseAdmin
    .from('inboxes')
    .select('slug')
    .eq('organization_id', organizationId)
    .like('slug', `${slug}%`);

  const taken = new Set((existing ?? []).map((r) => r.slug));
  if (taken.has(slug)) {
    let n = 2;
    while (taken.has(`${slug}-${n}`)) n += 1;
    slug = `${slug}-${n}`.slice(0, INBOX_LIMITS.maxSlugLength);
  }

  const { data, error } = await supabaseAdmin
    .from('inboxes')
    .insert({
      organization_id: organizationId,
      name: trimmed,
      slug,
      status: 'active',
      is_default: false,
      settings: {},
    })
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to create inbox.');
  if (memberIds.length > 0) {
    await replaceInboxMembers({
      organizationId,
      inboxId: data.id,
      memberIds,
    });
  }
  return normalizeInboxRow(data);
}

/**
 * @param {object} params
 */
export async function patchInbox({ organizationId, inboxId, name, status, settings }) {
  const { data: prior, error: priorErr } = await supabaseAdmin
    .from('inboxes')
    .select('*')
    .eq('id', inboxId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (priorErr) throw new HttpError(500, priorErr.message || 'Failed to load inbox.');
  if (!prior) throw new HttpError(404, 'Inbox not found.');

  const patch = {};
  if (name !== undefined) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) throw new HttpError(400, 'Inbox name cannot be empty.');
    if (trimmed.length > INBOX_LIMITS.maxNameLength) {
      throw new HttpError(400, `Inbox name must be at most ${INBOX_LIMITS.maxNameLength} characters.`);
    }
    patch.name = trimmed;
  }
  if (status !== undefined) {
    if (!isInboxStatus(status)) {
      throw new HttpError(400, 'status must be active or archived.');
    }
    if (prior.is_default && status === 'archived') {
      throw new HttpError(400, 'Cannot archive the default inbox. Set another inbox as default first.');
    }
    if (status === 'archived') {
      const { count } = await supabaseAdmin
        .from('inboxes')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'active');
      if ((count ?? 0) <= 1) {
        throw new HttpError(400, 'Cannot archive the last active inbox.');
      }
    }
    patch.status = status;
  }
  if (settings !== undefined) {
    patch.settings = mergeInboxSettings(settings);
  }

  if (Object.keys(patch).length === 0) return normalizeInboxRow(prior);

  const { data, error } = await supabaseAdmin
    .from('inboxes')
    .update(patch)
    .eq('id', inboxId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to update inbox.');
  return normalizeInboxRow(data);
}

/**
 * @param {string} organizationId
 * @param {string} inboxId
 */
export async function listInboxMembers(organizationId, inboxId) {
  await assertInboxInOrg(organizationId, inboxId);

  const { data, error } = await supabaseAdmin
    .from('inbox_members')
    .select('organization_member_id, role, created_at')
    .eq('inbox_id', inboxId);

  if (error) throw new HttpError(500, error.message || 'Failed to list inbox members.');
  return (data ?? []).map((r) => ({
    organizationMemberId: r.organization_member_id,
    role: r.role,
    createdAt: r.created_at,
  }));
}

/**
 * Replace inbox member set (bounded).
 * @param {object} params
 * @param {string[]} params.memberIds — organization_members.id
 * @param {Record<string, string>} [params.memberRoles] — memberId → role
 */
export async function replaceInboxMembers({ organizationId, inboxId, memberIds, memberRoles = {} }) {
  await assertInboxInOrg(organizationId, inboxId);

  const unique = [...new Set(memberIds.filter(Boolean))].slice(0, INBOX_LIMITS.maxMembersPerInbox);
  if (unique.length > 0) {
    const { data: valid, error: validErr } = await supabaseAdmin
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('status', 'ACTIVE')
      .in('id', unique);
    if (validErr) throw new HttpError(500, validErr.message || 'Failed to validate members.');
    const validIds = new Set((valid ?? []).map((r) => r.id));
    const invalid = unique.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new HttpError(400, 'One or more member ids are not active members of this organization.');
    }
  }

  const { error: delErr } = await supabaseAdmin.from('inbox_members').delete().eq('inbox_id', inboxId);
  if (delErr) throw new HttpError(500, delErr.message || 'Failed to update inbox members.');

  if (unique.length === 0) return [];

  const rows = unique.map((organizationMemberId) => {
    const roleRaw = memberRoles[organizationMemberId] ?? 'member';
    const role = isInboxMemberRole(roleRaw) ? roleRaw : 'member';
    return { inbox_id: inboxId, organization_member_id: organizationMemberId, role };
  });

  const { error: insErr } = await supabaseAdmin.from('inbox_members').insert(rows);
  if (insErr) throw new HttpError(500, insErr.message || 'Failed to set inbox members.');
  return rows;
}

async function assertInboxInOrg(organizationId, inboxId) {
  const { data, error } = await supabaseAdmin
    .from('inboxes')
    .select('id')
    .eq('id', inboxId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message || 'Failed to load inbox.');
  if (!data) throw new HttpError(404, 'Inbox not found.');
}

/**
 * Load inbox member ids for assignment eligibility.
 * @param {string} inboxId
 */
/**
 * Add one member to an inbox without replacing the full member set.
 * @param {object} params
 */
export async function addInboxMember({
  organizationId,
  inboxId,
  organizationMemberId,
  role = 'member',
}) {
  await assertInboxInOrg(organizationId, inboxId);

  const { data: member, error: memberErr } = await supabaseAdmin
    .from('organization_members')
    .select('id')
    .eq('id', organizationMemberId)
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (memberErr) throw new HttpError(500, memberErr.message || 'Failed to validate member.');
  if (!member) throw new HttpError(400, 'Member is not active in this organization.');

  const memberRole = isInboxMemberRole(role) ? role : 'member';
  const { error } = await supabaseAdmin.from('inbox_members').upsert(
    {
      inbox_id: inboxId,
      organization_member_id: organizationMemberId,
      role: memberRole,
    },
    { onConflict: 'inbox_id,organization_member_id' },
  );

  if (error) throw new HttpError(500, error.message || 'Failed to add inbox member.');
}

export async function loadInboxMemberIds(inboxId) {
  const { data, error } = await supabaseAdmin
    .from('inbox_members')
    .select('organization_member_id')
    .eq('inbox_id', inboxId);
  if (error) return null;
  const ids = (data ?? []).map((r) => r.organization_member_id).filter(Boolean);
  return ids.length > 0 ? ids : null;
}

export { ensureDefaultInboxForOrg, normalizeInboxRow };
