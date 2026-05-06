import { supabase } from './supabase.js'
import { apiFetch } from './api.js'

/**
 * Sign in with email and password.
 * @returns {Promise<{ data: import('@supabase/supabase-js').AuthResponse['data'], error: import('@supabase/supabase-js').AuthError | null }>}
 */
export async function login(email, password) {
  return supabase.auth.signInWithPassword({ email, password })
}

/**
 * Register a new user.
 * @param {object} [options] Passed to `signUp` (e.g. `{ data: { full_name } }`, `emailRedirectTo`).
 */
export async function signup(email, password, options = {}) {
  return supabase.auth.signUp({
    email,
    password,
    options,
  })
}

/**
 * Sign out the current session (local + server when configured).
 */
export async function logout() {
  return supabase.auth.signOut()
}

/**
 * Current user from the active session, or null if not signed in.
 */
export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) return null
  return user
}

/**
 * Complete one-time onboarding for a newly signed up user.
 */
export async function registerOnboarding({
  email,
  firstName,
  lastName,
  jobTitle,
  workspaceName,
  companySize,
  useCase,
  teamEmails = [],
}) {
  return apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      firstName,
      lastName,
      jobTitle,
      workspaceName,
      companySize,
      useCase,
      teamEmails,
    }),
  })
}
