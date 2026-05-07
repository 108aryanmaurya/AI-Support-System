import { supabaseAdmin } from '../config/supabase.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      res.status(500).json({ error: existingMembershipError.message || 'Failed to check onboarding status.' });
      return;
    }

    if (existingMembership) {
      res.status(409).json({
        error: 'User is already onboarded.',
        organizationId: existingMembership.organization_id,
      });
      return;
    }

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: payload.companyName,
        company_size: payload.companySize,
        use_case: payload.useCase,
      })
      .select('id')
      .single();

    if (organizationError || !organization?.id) {
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

    if (userError) {
      // Best-effort rollback to avoid orphan org record if profile fails.
      await supabaseAdmin.from('organizations').delete().eq('id', organization.id);
      res.status(500).json({ error: userError.message || 'Failed to create user profile.' });
      return;
    }

    const { error: membershipError } = await supabaseAdmin.from('organization_members').insert({
      user_id: authUser.id,
      organization_id: organization.id,
      role: 'admin',
    });

    if (membershipError) {
      // Best-effort rollback for consistency.
      await supabaseAdmin.from('organizations').delete().eq('id', organization.id);
      res.status(500).json({ error: membershipError.message || 'Failed to create organization membership.' });
      return;
    }

    const invited = payload.invitedEmails.map((email) => ({
      email,
      status: 'pending',
    }));

    res.status(201).json({
      success: true,
      organizationId: organization.id,
      invitedCount: invited.length,
      invitedPreview: invited,
    });
  } catch (error) {
    next(error);
  }
}
