import { supabaseAdmin } from '../config/supabase.js';

/**
 * Placeholder auth-related handlers (e.g. session info, callbacks).
 * Login/signup are typically done client-side with Supabase; protected routes use JWT middleware.
 */
export function getAuthInfo(req, res) {
  res.json({
    message: 'Auth API placeholder',
    endpoints: ['/api/auth/health', '/api/auth/me (protected)'],
  });
}

export function getHealth(req, res) {
  res.json({ ok: true, scope: 'auth' });
}

export function getMe(req, res) {
  const user = req.user;
  res.json({
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata,
    app_metadata: user.app_metadata,
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isMissingTableError(error, tableName) {
  const message = error?.message ?? '';
  return message.includes(`Could not find the table 'public.${tableName}'`);
}

function getMissingColumnName(error) {
  const message = error?.message ?? '';
  const match = message.match(/column '([^']+)'/i);
  return match?.[1] ?? null;
}

async function upsertUserProfileWithFallback(initialPayload) {
  let payload = { ...initialPayload };
  const maxAttempts = 6;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (!error && data) {
      return {
        profile: data,
        error: null,
        removedColumns: Object.keys(initialPayload).filter((key) => !(key in payload)),
        missingUsersTable: false,
      };
    }

    if (isMissingTableError(error, 'users')) {
      return {
        profile: null,
        error: null,
        removedColumns: Object.keys(initialPayload).filter((key) => !(key in payload)),
        missingUsersTable: true,
      };
    }

    const missingColumn = getMissingColumnName(error);
    if (!missingColumn || !(missingColumn in payload)) {
      return {
        profile: null,
        error,
        removedColumns: Object.keys(initialPayload).filter((key) => !(key in payload)),
        missingUsersTable: false,
      };
    }

    delete payload[missingColumn];
  }

  return {
    profile: null,
    error: new Error('Failed to upsert user profile after schema fallbacks.'),
    removedColumns: [],
    missingUsersTable: false,
  };
}

export async function registerUser(req, res, next) {
  try {
    const authUser = req.user;
    const {
      email,
      firstName,
      lastName,
      jobTitle,
      workspaceName,
      companySize,
      useCase,
      teamEmails = [],
    } = req.body ?? {};

    if (!email || !isValidEmail(email)) {
      res.status(400).json({ error: 'A valid email is required.' });
      return;
    }
    if (!workspaceName || typeof workspaceName !== 'string' || !workspaceName.trim()) {
      res.status(400).json({ error: 'Workspace name is required.' });
      return;
    }
    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
      res.status(400).json({ error: 'First name is required.' });
      return;
    }
    if (!lastName || typeof lastName !== 'string' || !lastName.trim()) {
      res.status(400).json({ error: 'Last name is required.' });
      return;
    }
    if (!jobTitle || typeof jobTitle !== 'string' || !jobTitle.trim()) {
      res.status(400).json({ error: 'Job title is required.' });
      return;
    }
    if (!companySize || typeof companySize !== 'string' || !companySize.trim()) {
      res.status(400).json({ error: 'Company size is required.' });
      return;
    }
    if (!useCase || typeof useCase !== 'string' || !useCase.trim()) {
      res.status(400).json({ error: 'Use case is required.' });
      return;
    }
    if (authUser.email !== email) {
      res.status(403).json({ error: 'Authenticated user does not match registration email.' });
      return;
    }

    const cleanTeamEmails = Array.isArray(teamEmails)
      ? teamEmails.map((value) => String(value).trim()).filter(Boolean)
      : [];
    const invalidInviteEmail = cleanTeamEmails.find((value) => !isValidEmail(value));
    if (invalidInviteEmail) {
      res.status(400).json({ error: `Invalid team email: ${invalidInviteEmail}` });
      return;
    }

    let organization = null;
    let organizationWarning = null;

    const { data: createdOrg, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: workspaceName.trim(),
        created_by: authUser.id,
      })
      .select()
      .single();

    if (orgError) {
      if (isMissingTableError(orgError, 'organizations')) {
        organizationWarning = 'organizations table not found; onboarding continued without organization record.';
      } else {
        res.status(500).json({ error: orgError.message || 'Failed to create organization.' });
        return;
      }
    } else {
      organization = createdOrg;
    }

    const userInsert = {
      id: authUser.id,
      email,
      organization_id: organization?.id ?? null,
      role: 'admin',
      onboarding_completed: true,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      job_title: jobTitle.trim(),
      company_size: companySize.trim(),
      use_case: useCase.trim(),
      invited_team_emails: cleanTeamEmails,
    };

    const {
      profile,
      error: userError,
      removedColumns,
      missingUsersTable,
    } = await upsertUserProfileWithFallback(userInsert);

    if (userError) {
      res.status(500).json({ error: userError?.message || 'Failed to create user profile.' });
      return;
    }

    const resolvedUser =
      profile ??
      ({
        id: authUser.id,
        email: authUser.email,
        role: 'admin',
        onboarding_completed: true,
        organization_id: organization?.id ?? null,
      });

    res.status(201).json({
      organization,
      user: resolvedUser,
      warnings: [
        organizationWarning,
        missingUsersTable ? 'users table not found; using auth user only until profile table exists.' : null,
        removedColumns.length ? `Skipped unavailable user columns: ${removedColumns.join(', ')}` : null,
      ].filter(Boolean),
    });
  } catch (error) {
    next(error);
  }
}
