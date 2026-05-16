/** Auth namespace discovery (login/signup use Supabase client; API validates JWT). */
export function getAuthInfo(req, res) {
  res.json({
    ok: true,
    scope: 'auth',
    endpoints: {
      health: 'GET /api/auth/health',
      me: 'GET /api/auth/me',
    },
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
