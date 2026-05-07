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
