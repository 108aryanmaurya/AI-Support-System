import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import {
  acceptInviteForUser,
  classifyInvite,
  createInviteRecord,
  createInvitesBatchForOrganization,
  createOrganizationWithAdmin,
  assertInviteEmailNotExistingMember,
  getInviteByToken,
  isValidInviteRole,
  listChannelsForOrganization,
  listMembersForOrganization,
  listOrganizationsForUser,
  listPendingInvitesForOrganization,
  newInviteToken,
  validateInviteEmail,
} from '../services/org.service.js';
import { sendTeammateInviteEmail } from '../services/orgInviteEmail.service.js';
import { supabaseAdmin } from '../config/supabase.js';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

function displayNameFromUser(user) {
  const full = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return full || (typeof user?.email === 'string' ? user.email.split('@')[0] : '') || null;
}

export async function createOrgController(req, res, next) {
  try {
    const name = req.body?.name;
    const companySize = req.body?.companySize ?? req.body?.company_size;
    const useCase = req.body?.useCase ?? req.body?.use_case;
    const result = await createOrganizationWithAdmin({
      userId: req.user.id,
      name,
      companySize,
      useCase,
    });

    res.status(201).json({
      organization: result.organization,
      membership: result.membership,
    });
  } catch (error) {
    next(error);
  }
}

export async function listMyOrgsController(req, res, next) {
  try {
    const organizations = await listOrganizationsForUser(req.user.id);
    res.json({ organizations });
  } catch (error) {
    next(error);
  }
}

export async function createInviteController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    const emailRaw = req.body?.email;
    const roleRaw = req.body?.role;

    const email = validateInviteEmail(emailRaw);
    if (!email) throw new HttpError(400, 'A valid email is required.');

    const role = isValidInviteRole(roleRaw);
    if (!role) throw new HttpError(400, 'role must be ADMIN or AGENT.');

    await assertInviteEmailNotExistingMember(organizationId, email);

    const token = newInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const expiresAtIso = expiresAt.toISOString();

    const invite = await createInviteRecord({
      organizationId,
      email,
      role,
      expiresAtIso,
      token,
    });

    const absoluteLink = `${env.publicAppUrl}/invite?token=${encodeURIComponent(token)}`;

    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .limit(1)
      .maybeSingle();

    const emailResult = await sendTeammateInviteEmail({
      organizationId,
      organizationName: orgRow?.name ?? null,
      toEmail: email,
      inviteLink: absoluteLink,
      role,
      expiresAtIso,
      inviterDisplayName: displayNameFromUser(req.user),
    });

    res.status(201).json({
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expires_at,
        createdAt: invite.created_at,
      },
      emailSent: emailResult.ok === true && emailResult.skipped !== true,
      emailSkipped: emailResult.skipped === true,
      ...(emailResult.ok ? {} : { emailError: emailResult.error || 'Invite email failed.' }),
    });
  } catch (error) {
    next(error);
  }
}

export async function getInviteByTokenController(req, res, next) {
  try {
    const token = req.params?.token;
    const invite = await getInviteByToken(token);
    const verdict = classifyInvite(invite);

    if (!invite || verdict.reason === 'not_found') {
      res.status(404).json({ error: 'Invite not found.' });
      return;
    }

    if (verdict.reason === 'expired') {
      res.status(410).json({ error: 'This invite has expired.' });
      return;
    }

    if (!verdict.ok) {
      res.status(400).json({ error: 'This invite is no longer valid.' });
      return;
    }

    const rawOrg = invite.organizations;
    const org = Array.isArray(rawOrg) ? rawOrg[0] ?? null : rawOrg ?? null;
    res.json({
      invite: {
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expires_at,
      },
      organization: org
        ? {
            id: org.id,
            name: org.name,
            createdAt: org.created_at,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
}

export async function listMembersController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    const members = await listMembersForOrganization(organizationId);
    res.json({ members });
  } catch (error) {
    next(error);
  }
}

export async function listPendingInvitesController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    const invites = await listPendingInvitesForOrganization(organizationId);
    res.json({ invites });
  } catch (error) {
    next(error);
  }
}

export async function listWorkspaceChannelsController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    const channels = await listChannelsForOrganization(organizationId);
    res.json({ channels });
  } catch (error) {
    next(error);
  }
}

export async function createInvitesBatchController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    const emailsRaw = req.body?.emails;
    const emails = Array.isArray(emailsRaw)
      ? emailsRaw
      : typeof emailsRaw === 'string'
        ? emailsRaw
            .split(/[\s,;]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const roleRaw = req.body?.role;

    const inboxIdRaw = req.body?.inboxId ?? req.body?.inbox_id ?? null;
    const inboxId =
      typeof inboxIdRaw === 'string' && inboxIdRaw.trim() ? inboxIdRaw.trim() : null;

    const result = await createInvitesBatchForOrganization({
      organizationId,
      emails,
      role: roleRaw,
      inboxId,
    });

    res.status(200).json({
      created: result.created,
      errors: result.errors,
    });
  } catch (error) {
    next(error);
  }
}

export async function acceptInviteController(req, res, next) {
  try {
    const token = req.body?.token;
    const result = await acceptInviteForUser({
      token,
      userId: req.user.id,
      userEmail: req.user.email,
    });

    res.status(result.alreadyMember ? 200 : 201).json({
      organizationId: result.organizationId,
      membership: result.membership,
      alreadyMember: result.alreadyMember,
    });
  } catch (error) {
    next(error);
  }
}
