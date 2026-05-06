import { supabaseAdmin } from '../config/supabase.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isMissingTableError(error, tableName) {
  return (error?.message ?? '').includes(`Could not find the table 'public.${tableName}'`);
}

function validatePayload(body) {
  const {
    firstName,
    lastName,
    companyName,
    jobTitle,
    companySize,
    useCase,
    invitedEmails = [],
  } = body ?? {};

  if (!firstName?.trim()) return { error: 'First name is required.' };
  if (!lastName?.trim()) return { error: 'Last name is required.' };
  if (!companyName?.trim()) return { error: 'Company name is required.' };
  if (!jobTitle?.trim()) return { error: 'Job title is required.' };
  if (!companySize?.trim()) return { error: 'Company size is required.' };
  if (useCase != null && typeof useCase !== 'string') return { error: 'Use case must be a string.' };
  if (!Array.isArray(invitedEmails)) return { error: 'invitedEmails must be an array.' };

  const invalidInvite = invitedEmails.find((email) => !EMAIL_REGEX.test(String(email).trim()));
  if (invalidInvite) return { error: `Invalid invited email: ${invalidInvite}` };

  return {
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      companyName: companyName.trim(),
      jobTitle: jobTitle.trim(),
      companySize: companySize.trim(),
      useCase: useCase?.trim() || null,
      invitedEmails: invitedEmails.map((email) => String(email).trim()).filter(Boolean),
    },
  };
}

export async function completeOnboarding(req, res, next) {
  try {
    const authUser = req.user;
    const validated = validatePayload(req.body);

    if (validated.error) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const payload = validated.data;

    const { data: existingMembership, error: existingMembershipError } = await supabaseAdmin
      .from('organization_members')
      .select('id, organization_id')
      .eq('user_id', authUser.id)
      .limit(1)
      .maybeSingle();

    if (existingMembershipError) {
      if (!isMissingTableError(existingMembershipError, 'organization_members')) {
        res.status(500).json({ error: existingMembershipError.message || 'Failed to check onboarding status.' });
        return;
      }
    }

    if (existingMembership) {
      res.status(409).json({
        error: 'User is already onboarded.',
        organizationId: existingMembership.organization_id,
      });
      return;
    }

    const organizationInsert = {
      name: payload.companyName,
      company_size: payload.companySize,
    };
    if (payload.useCase) organizationInsert.use_case = payload.useCase;

    let organization = null;
    let organizationError = null;
    ({
      data: organization,
      error: organizationError,
    } = await supabaseAdmin.from('organizations').insert(organizationInsert).select('id').single());

    if (organizationError && organizationInsert.use_case && organizationError.message?.includes("column 'use_case'")) {
      ({
        data: organization,
        error: organizationError,
      } = await supabaseAdmin
        .from('organizations')
        .insert({
          name: payload.companyName,
          company_size: payload.companySize,
        })
        .select('id')
        .single());
    }

    const missingOrganizationsTable = isMissingTableError(organizationError, 'organizations');

    if (organizationError && !missingOrganizationsTable) {
      res.status(500).json({ error: organizationError?.message || 'Failed to create organization.' });
      return;
    }

    const { error: userError } = await supabaseAdmin.from('users').upsert(
      {
        id: authUser.id,
        email: authUser.email,
        first_name: payload.firstName,
        last_name: payload.lastName,
        job_title: payload.jobTitle,
      },
      { onConflict: 'id' },
    );

    const missingUsersTable = isMissingTableError(userError, 'users');
    if (userError && !missingUsersTable) {
      res.status(500).json({ error: userError.message || 'Failed to create user profile.' });
      return;
    }

    let membershipError = null;
    if (!missingOrganizationsTable) {
      ({ error: membershipError } = await supabaseAdmin.from('organization_members').insert({
        user_id: authUser.id,
        organization_id: organization.id,
        role: 'admin',
      }));
    }

    if (membershipError) {
      if (!isMissingTableError(membershipError, 'organization_members')) {
        res.status(500).json({ error: membershipError.message || 'Failed to create organization membership.' });
        return;
      }
    }

    const invited = payload.invitedEmails.map((email) => ({
      email,
      status: 'pending',
    }));

    res.status(201).json({
      success: true,
      organizationId: organization?.id ?? null,
      invitedCount: invited.length,
      invitedPreview: invited,
      warnings: [
        missingOrganizationsTable
          ? 'organizations table missing; organization record and membership linkage were skipped.'
          : null,
        missingUsersTable
          ? 'users table missing; profile record was not persisted.'
          : null,
        isMissingTableError(existingMembershipError, 'organization_members')
          ? 'organization_members table missing; duplicate onboarding protection is limited.'
          : null,
        isMissingTableError(membershipError, 'organization_members')
          ? 'organization_members table missing; admin membership was not persisted.'
          : null,
      ].filter(Boolean),
    });
  } catch (error) {
    next(error);
  }
}
