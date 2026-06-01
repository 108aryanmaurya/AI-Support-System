import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { sendTeammateInviteEmail } from './orgInviteEmail.service.js';
import { resolveInboxIdForNewConversation } from './resolveInboxForConversation.service.js';
import {
  INBOX_LIMITS,
  CUSTOM_PERMISSION_ROLE_NAME,
  defaultInboxMemberPermissions,
  isValidOrgPermissionRoleId,
  mergeInboxMemberPermissions,
  normalizeOrgPermissionRoleName,
  validateInboxMemberPermissionsForSave,
  withPermissionTemplateMeta,
} from '@ai-support/shared';
import { addInboxMember, listActiveInboxIdsForOrganization } from './inboxes.service.js';
import {
  mergeOrganizationMemberPermissions,
  setOrganizationMemberPermissions,
} from './organizationMemberPermissions.service.js';
import { getOrCreateSuperOrganizationForUser } from './superOrganization.service.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INVITE_INBOX_IDS = INBOX_LIMITS.maxInboxes;

const MEMBER_ROLE_MAX_LEN = 64;

/**
 * Normalizes a dynamic role label for storage (invites + membership).
 * @param {unknown} role
 * @param {string} [fallback]
 */
export function normalizeMemberRole(role, fallback = 'member') {
  const raw = typeof role === 'string' ? role.trim() : '';
  const base = raw || (typeof fallback === 'string' ? fallback.trim() : '') || 'member';
  return base.length > MEMBER_ROLE_MAX_LEN ? base.slice(0, MEMBER_ROLE_MAX_LEN) : base;
}

/** @deprecated Use {@link normalizeMemberRole} */
export function isValidInviteRole(role) {
  const normalized = normalizeMemberRole(role, '');
  return normalized || null;
}

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** ACTIVE membership only — used for auth gates. */
export async function getActiveMembership({ userId, organizationId }) {
  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('id, user_id, organization_id, role, status')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to resolve organization membership.');
  }
  return data ?? null;
}

/** Full capability set for the user who creates a new workspace. */
function creatorOrganizationMemberPermissions() {
  const perms = defaultInboxMemberPermissions();
  perms.role = 'lead';
  return perms;
}

export async function createOrganizationWithAdmin({
  userId,
  name,
  companySize,
  useCase,
}) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new HttpError(400, 'Organization name is required.');
  if (trimmed.length > 256) throw new HttpError(400, 'Organization name is too long.');

  const sizeTrimmed =
    typeof companySize === 'string' && companySize.trim()
      ? companySize.trim()
      : null;
  const useTrimmed =
    typeof useCase === 'string' && useCase.trim() ? useCase.trim() : null;
  if (sizeTrimmed && sizeTrimmed.length > 64) {
    throw new HttpError(400, 'Company size value is too long.');
  }
  if (useTrimmed && useTrimmed.length > 256) {
    throw new HttpError(400, 'Use case value is too long.');
  }

  const superOrganizationId = await getOrCreateSuperOrganizationForUser(userId);

  const normalizedName = trimmed.toLowerCase();
  const { data: existingByName, error: dupErr } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('super_organization_id', superOrganizationId);

  if (dupErr) {
    throw new HttpError(500, dupErr.message || 'Failed to check existing organizations.');
  }
  const duplicate = (existingByName ?? []).some(
    (row) => typeof row?.name === 'string' && row.name.trim().toLowerCase() === normalizedName,
  );
  if (duplicate) {
    throw new HttpError(409, 'You already have an organization with this name.');
  }

  const creatorPermissions = creatorOrganizationMemberPermissions();

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({
      name: trimmed,
      created_by: userId,
      super_organization_id: superOrganizationId,
      company_size: sizeTrimmed,
      use_case: useTrimmed,
    })
    .select('id, name, created_at, created_by, super_organization_id')
    .single();

  if (orgError || !org?.id) {
    throw new HttpError(500, orgError?.message || 'Failed to create organization.');
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from('organization_members')
    .insert({
      user_id: userId,
      organization_id: org.id,
      role: 'member',
      status: 'ACTIVE',
      permissions: creatorPermissions,
    })
    .select('id, role, status, permissions')
    .single();

  if (memberError || !member?.id) {
    await supabaseAdmin.from('organizations').delete().eq('id', org.id);
    throw new HttpError(500, memberError?.message || 'Failed to create organization membership.');
  }

  return {
    organization: org,
    membership: {
      ...member,
      permissions: mergeOrganizationMemberPermissions(member.permissions),
    },
  };
}

export async function listOrganizationsForUser(userId) {
  const { data: rows, error } = await supabaseAdmin
    .from('organization_members')
    .select(
      `
      id,
      role,
      status,
      created_at,
      organizations (
        id,
        name,
        created_at,
        created_by,
        super_organization_id
      )
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load organizations.');
  }

  return (rows ?? []).map((row) => {
    const org = row.organizations;
    const organization = Array.isArray(org) ? org[0] ?? null : org ?? null;
    return {
      membershipId: row.id,
      role: row.role,
      status: row.status,
      joinedAt: row.created_at,
      organization,
    };
  });
}

/**
 * Stored invite targets: `inbox_ids` JSON array; legacy `inbox_id` column.
 * @param {object | null | undefined} invite
 * @returns {string[]}
 */
export function parseStoredInviteInboxIds(invite) {
  const raw = invite?.inbox_ids;
  if (Array.isArray(raw)) {
    const ids = raw
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter((id) => UUID_REGEX.test(id));
    if (ids.length > 0) return [...new Set(ids)];
  }
  const legacy = invite?.inbox_id;
  if (typeof legacy === 'string' && UUID_REGEX.test(legacy.trim())) {
    return [legacy.trim()];
  }
  return [];
}

/**
 * @param {string} organizationId
 * @param {object} invite
 * @returns {Promise<string[]>}
 */
export async function resolveInviteInboxIdsForAccept(_organizationId, invite) {
  return parseStoredInviteInboxIds(invite);
}

/**
 * @param {string} organizationId
 * @param {{ inboxIds?: unknown, inboxId?: string | null }} input
 * @returns {Promise<string[]>}
 */
export async function normalizeInviteInboxIdsForCreate(organizationId, input = {}) {
  let candidates = [];
  if (Array.isArray(input.inboxIds)) {
    candidates = input.inboxIds
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean);
  } else if (typeof input.inboxId === 'string' && input.inboxId.trim()) {
    candidates = [input.inboxId.trim()];
  }
  if (candidates.length === 0) return [];

  const unique = [...new Set(candidates)].slice(0, MAX_INVITE_INBOX_IDS);
  const validated = [];
  for (const id of unique) {
    validated.push(await resolveInboxIdForNewConversation(organizationId, id));
  }
  return validated;
}

/**
 * @param {object} params
 */
async function persistInvitePermissionsOnOrganizationMember(organizationMemberId, invite) {
  const merged = mergeOrganizationMemberPermissions(invite.permissions);
  await setOrganizationMemberPermissions(organizationMemberId, merged);
}

async function addMemberToInviteTargetInboxes({
  organizationId,
  invite,
  organizationMemberId,
}) {
  const inboxIds = await resolveInviteInboxIdsForAccept(organizationId, invite);
  if (inboxIds.length === 0) return;

  const memberRole = mapPermissionRoleToInboxMemberRole(invite.permissions);
  for (const inboxId of inboxIds) {
    try {
      await addInboxMember({
        organizationId,
        inboxId,
        organizationMemberId,
        role: memberRole,
        storeInboxPermissions: false,
      });
    } catch (inboxErr) {
      console.warn(
        JSON.stringify({
          event: 'invite.accept_inbox_member_skipped',
          organization_id: organizationId,
          inbox_id: inboxId,
          member_id: organizationMemberId,
          error: inboxErr?.message ?? 'failed',
        }),
      );
    }
  }
}

export async function createInviteRecord({
  organizationId,
  email,
  role,
  expiresAtIso,
  token,
  inboxIds = [],
  inboxId = null,
  permissions = undefined,
}) {
  const storedInboxIds =
    Array.isArray(inboxIds) && inboxIds.length > 0
      ? inboxIds
      : typeof inboxId === 'string' && inboxId
        ? [inboxId]
        : [];

  const { data, error } = await supabaseAdmin
    .from('invites')
    .insert({
      organization_id: organizationId,
      email,
      role,
      token,
      status: 'PENDING',
      expires_at: expiresAtIso,
      inbox_id: storedInboxIds.length === 1 ? storedInboxIds[0] : null,
      inbox_ids: storedInboxIds,
      permissions: mergeInboxMemberPermissions(permissions),
    })
    .select('id, email, role, token, status, expires_at, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new HttpError(
        409,
        'An outstanding invite already exists for this email in this organization.',
      );
    }
    throwInviteSchemaMigrationError(error);
    throw new HttpError(500, error.message || 'Failed to create invite.');
  }

  return data;
}

/**
 * PostgREST schema cache errors when invite inbox/permissions migrations were not applied.
 * @param {{ message?: string }} error
 */
function throwInviteSchemaMigrationError(error) {
  const msg = typeof error?.message === 'string' ? error.message : '';
  if (!msg.includes('schema cache')) return;
  if (!msg.includes('inbox_id') && !msg.includes('inbox_ids') && !msg.includes('permissions')) {
    return;
  }
  throw new HttpError(
    503,
    'Database migration required for team invites. In Supabase → SQL Editor, run supabase/scripts/repair-invite-inbox-schema.sql (and 20260530100000_multiple_inboxes.sql first if the inboxes table is missing).',
  );
}

export async function getInviteByToken(token) {
  if (!token || typeof token !== 'string') return null;

  const { data, error } = await supabaseAdmin
    .from('invites')
    .select(
      `
      id,
      email,
      role,
      token,
      status,
      expires_at,
      created_at,
      organization_id,
      inbox_id,
      inbox_ids,
      permissions,
      organizations (
        id,
        name,
        created_at
      )
    `,
    )
    .eq('token', token.trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load invite.');
  }

  return data;
}

/**
 * Validates invite for display / acceptance (caller checks auth where needed).
 */
export function classifyInvite(inviteRow) {
  if (!inviteRow) return { ok: false, reason: 'not_found' };
  if (inviteRow.status !== 'PENDING') return { ok: false, reason: 'not_pending' };

  const exp = inviteRow.expires_at ? new Date(inviteRow.expires_at) : null;
  if (exp && Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true };
}

export async function acceptInviteForUser({ token, userId, userEmail }) {
  const raw = typeof token === 'string' ? token.trim() : '';
  if (!raw) throw new HttpError(400, 'token is required.');

  if (!userEmail || typeof userEmail !== 'string') {
    throw new HttpError(400, 'Your account does not have an email; cannot accept this invite.');
  }

  const invite = await getInviteByToken(raw);
  const verdict = classifyInvite(invite);
  if (!verdict.ok) {
    if (verdict.reason === 'not_found') throw new HttpError(404, 'Invite not found.');
    if (verdict.reason === 'expired') throw new HttpError(410, 'This invite has expired.');
    throw new HttpError(400, 'This invite is no longer valid.');
  }

  const normalizedInviteEmail = normalizeEmail(invite.email);
  const normalizedUserEmail = normalizeEmail(userEmail);
  if (!normalizedUserEmail || normalizedUserEmail !== normalizedInviteEmail) {
    throw new HttpError(
      403,
      'Signed-in account email must match the invite email.',
    );
  }

  const role = normalizeMemberRole(invite.role, 'member');

  const orgId = invite.organization_id;

  const mergedInvitePermissions = mergeOrganizationMemberPermissions(invite.permissions);

  const existing = await getActiveMembership({ userId, organizationId: orgId });
  if (existing) {
    await supabaseAdmin.from('invites').update({ status: 'ACCEPTED' }).eq('id', invite.id);
    await persistInvitePermissionsOnOrganizationMember(existing.id, invite);
    await addMemberToInviteTargetInboxes({
      organizationId: orgId,
      invite,
      organizationMemberId: existing.id,
    });
    return {
      alreadyMember: true,
      organizationId: orgId,
      membership: { ...existing, permissions: mergedInvitePermissions },
    };
  }

  const { data: membership, error: insErr } = await supabaseAdmin
    .from('organization_members')
    .insert({
      user_id: userId,
      organization_id: orgId,
      role,
      status: 'ACTIVE',
      permissions: mergedInvitePermissions,
    })
    .select('id, role, status, permissions')
    .single();

  if (insErr || !membership?.id) {
    if (insErr?.code === '23505') {
      throw new HttpError(409, 'You are already a member of this organization.');
    }
    throw new HttpError(500, insErr?.message || 'Failed to join organization.');
  }

  const { error: updErr } = await supabaseAdmin
    .from('invites')
    .update({ status: 'ACCEPTED' })
    .eq('id', invite.id)
    .eq('status', 'PENDING');

  if (updErr) {
    throw new HttpError(500, updErr.message || 'Failed to finalize invite.');
  }

  await addMemberToInviteTargetInboxes({
    organizationId: orgId,
    invite,
    organizationMemberId: membership.id,
  });

  return {
    alreadyMember: false,
    organizationId: orgId,
    membership: {
      ...membership,
      permissions: mergeOrganizationMemberPermissions(membership.permissions),
    },
  };
}

export function validateInviteEmail(email) {
  const e = typeof email === 'string' ? email.trim() : '';
  if (!e || !EMAIL_REGEX.test(e)) return null;
  return normalizeEmail(e);
}

export function newInviteToken() {
  return randomUUID();
}

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

/** Normalized emails of ACTIVE members in this organization. */
async function loadActiveMemberEmailsSet(organizationId) {
  const { data: rows, error } = await supabaseAdmin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE');

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load members.');
  }

  const ids = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))];
  const emailSet = new Set();
  if (ids.length === 0) return emailSet;

  const { data: users, error: uErr } = await supabaseAdmin
    .from('users')
    .select('email')
    .in('id', ids);

  if (uErr) {
    throw new HttpError(500, uErr.message || 'Failed to load member emails.');
  }

  for (const u of users ?? []) {
    const e = normalizeEmail(u?.email ?? '');
    if (e) emailSet.add(e);
  }
  return emailSet;
}

/** Normalized emails with a non-expired PENDING invite in this organization. */
async function loadPendingInviteEmailsSet(organizationId) {
  const pending = await listPendingInvitesForOrganization(organizationId);
  const emailSet = new Set();
  for (const row of pending) {
    const e = normalizeEmail(row?.email ?? '');
    if (e) emailSet.add(e);
  }
  return emailSet;
}

/**
 * Rejects invite when the email already belongs to an ACTIVE org member.
 */
export async function assertInviteEmailNotExistingMember(organizationId, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new HttpError(400, 'A valid email is required.');

  const memberEmails = await loadActiveMemberEmailsSet(organizationId);
  if (memberEmails.has(normalized)) {
    throw new HttpError(409, 'This person is already a teammate in this workspace.');
  }
}

function mapMemberRowsWithUsers(rows, userMap) {
  return (rows ?? []).map((row) => {
    const u = userMap.get(row.user_id);
    return {
      id: row.id,
      membershipId: row.id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      joinedAt: row.created_at,
      email: u?.email ?? null,
      firstName: u?.first_name ?? null,
      lastName: u?.last_name ?? null,
      permissions: mergeOrganizationMemberPermissions(row.permissions),
    };
  });
}

async function loadUserMapForMemberRows(rows) {
  const ids = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))];
  const userMap = new Map();
  if (ids.length === 0) return userMap;

  const { data: users, error: uErr } = await supabaseAdmin
    .from('users')
    .select('id, email, first_name, last_name')
    .in('id', ids);
  if (uErr) {
    throw new HttpError(500, uErr.message || 'Failed to load user profiles.');
  }
  for (const u of users ?? []) {
    userMap.set(u.id, u);
  }
  return userMap;
}

/** Active members with profile rows from `public.users`. */
export async function listMembersForOrganization(organizationId) {
  const { data: rows, error } = await supabaseAdmin
    .from('organization_members')
    .select('id, role, status, created_at, user_id, permissions')
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load members.');
  }

  const userMap = await loadUserMapForMemberRows(rows);
  return mapMemberRowsWithUsers(rows, userMap);
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 */
export async function getOrganizationMemberById(organizationId, memberId) {
  const { data: row, error } = await supabaseAdmin
    .from('organization_members')
    .select('id, role, status, created_at, user_id, permissions, organization_id')
    .eq('id', memberId)
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load member.');
  }
  if (!row) {
    throw new HttpError(404, 'Teammate not found in this organization.');
  }

  const userMap = await loadUserMapForMemberRows([row]);
  return mapMemberRowsWithUsers([row], userMap)[0];
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.memberId
 * @param {unknown} params.permissions
 */
export async function updateOrganizationMemberPermissions({
  organizationId,
  memberId,
  permissions,
}) {
  const member = await getOrganizationMemberById(organizationId, memberId);

  const merged = mergeOrganizationMemberPermissions(permissions);
  const check = validateInboxMemberPermissionsForSave(merged);
  if (!check.ok) {
    throw new HttpError(400, check.error);
  }

  const templateRoleId =
    typeof merged.templateRoleId === 'string' && isValidOrgPermissionRoleId(merged.templateRoleId)
      ? merged.templateRoleId.trim()
      : null;

  let storedPermissions = merged;
  let roleLabel = normalizeMemberRole(member.role, 'member');

  if (templateRoleId) {
    const { data: template, error: tErr } = await supabaseAdmin
      .from('org_teammate_permission_roles')
      .select('id, name, permissions')
      .eq('id', templateRoleId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (tErr) {
      throw new HttpError(500, tErr.message || 'Failed to load permission role.');
    }
    if (!template) {
      throw new HttpError(400, 'Selected permission role no longer exists.');
    }

    storedPermissions = withPermissionTemplateMeta(template.permissions, {
      templateRoleId: template.id,
      templateRoleName: template.name,
    });
    roleLabel = normalizeMemberRole(template.name, 'member');
  } else {
    storedPermissions = withPermissionTemplateMeta(merged, {
      templateRoleId: null,
      templateRoleName: CUSTOM_PERMISSION_ROLE_NAME,
    });
    const customName =
      typeof merged.templateRoleName === 'string' ? merged.templateRoleName.trim() : '';
    if (customName && customName.toLowerCase() !== CUSTOM_PERMISSION_ROLE_NAME.toLowerCase()) {
      roleLabel = normalizeMemberRole(customName, roleLabel);
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('organization_members')
    .update({
      permissions: storedPermissions,
      role: roleLabel,
    })
    .eq('id', memberId)
    .eq('organization_id', organizationId)
    .select('id, role, status, created_at, user_id, permissions')
    .single();

  if (error || !updated) {
    throw new HttpError(500, error?.message || 'Failed to update teammate permissions.');
  }

  const userMap = await loadUserMapForMemberRows([updated]);
  return mapMemberRowsWithUsers([updated], userMap)[0];
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.memberId
 * @param {string} params.actorUserId
 */
export async function removeOrganizationMember({ organizationId, memberId, actorUserId }) {
  const member = await getOrganizationMemberById(organizationId, memberId);
  if (member.userId === actorUserId) {
    throw new HttpError(400, 'You cannot remove yourself from this workspace.');
  }

  const { error } = await supabaseAdmin
    .from('organization_members')
    .delete()
    .eq('id', memberId)
    .eq('organization_id', organizationId);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to remove teammate.');
  }

  return { removed: true, memberId };
}

/** Pending invites for an organization (not expired; caller may filter further). */
export async function listPendingInvitesForOrganization(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('invites')
    .select('id, email, role, status, expires_at, created_at')
    .eq('organization_id', organizationId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load invites.');
  }

  const now = Date.now();
  return (data ?? []).filter((row) => {
    if (!row.expires_at) return true;
    const t = new Date(row.expires_at).getTime();
    return Number.isFinite(t) && t > now;
  });
}

/** Email / web / messenger channels for inbox assignment UI. */
export async function listChannelsForOrganization(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('channels')
    .select('id, name, type, is_active')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load channels.');
  }

  return data ?? [];
}

/**
 * Create multiple invites (default role AGENT). Each email is validated; duplicates or conflicts become entries in `errors`.
 */
function mapPermissionRoleToInboxMemberRole(permissions) {
  const p = mergeInboxMemberPermissions(permissions);
  if (p.role === 'lead') return 'lead';
  return 'member';
}

export async function createInvitesBatchForOrganization({
  organizationId,
  emails,
  role,
  inboxId = null,
  inboxIds = undefined,
  permissions = undefined,
}) {
  if (!Array.isArray(emails)) {
    throw new HttpError(400, 'emails must be an array.');
  }
  const normalized = [...new Set(emails.map((e) => validateInviteEmail(e)).filter(Boolean))];
  if (normalized.length === 0) {
    throw new HttpError(400, 'No valid email addresses.');
  }
  if (normalized.length > 50) {
    throw new HttpError(400, 'Maximum 50 emails per request.');
  }

  const mergedPermissions = mergeInboxMemberPermissions(permissions);
  const roleFromTemplate =
    typeof mergedPermissions?.templateRoleName === 'string'
      ? mergedPermissions.templateRoleName.trim()
      : '';
  const r = normalizeMemberRole(role, roleFromTemplate || 'member');
  const targetInboxIds = await normalizeInviteInboxIdsForCreate(organizationId, {
    inboxIds,
    inboxId,
  });
  const expiresAtIso = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { data: orgRow } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .limit(1)
    .maybeSingle();
  const organizationName =
    typeof orgRow?.name === 'string' && orgRow.name.trim() ? orgRow.name.trim() : null;

  const memberEmails = await loadActiveMemberEmailsSet(organizationId);
  const pendingInviteEmails = await loadPendingInviteEmailsSet(organizationId);

  const created = [];
  const errors = [];

  for (const email of normalized) {
    if (memberEmails.has(email)) {
      errors.push({
        email,
        code: 'already_member',
        error: 'This person is already a teammate in this workspace.',
      });
      continue;
    }
    if (pendingInviteEmails.has(email)) {
      errors.push({
        email,
        code: 'pending_invite',
        error: 'An invite is already pending for this email.',
      });
      continue;
    }

    try {
      const token = newInviteToken();
      const invite = await createInviteRecord({
        organizationId,
        email,
        role: r,
        expiresAtIso,
        token,
        inboxIds: targetInboxIds,
        permissions: mergedPermissions,
      });
      const link = `${env.publicAppUrl}/invite?token=${encodeURIComponent(token)}`;
      const emailResult = await sendTeammateInviteEmail({
        organizationId,
        organizationName,
        toEmail: email,
        inviteLink: link,
        role: r,
        expiresAtIso,
      });
      created.push({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expires_at,
        emailSent: emailResult.ok === true && emailResult.skipped !== true,
        emailSkipped: emailResult.skipped === true,
        ...(emailResult.ok ? {} : { emailError: emailResult.error || 'Invite email failed.' }),
      });
      pendingInviteEmails.add(email);
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Failed to create invite.';
      errors.push({ email, error: msg });
    }
  }

  return { created, errors };
}
