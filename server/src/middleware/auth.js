import { supabaseAdmin } from '../config/supabase.js';

function extractBearerToken(authorization) {
  if (!authorization || typeof authorization !== 'string') return null;
  const prefix = 'Bearer ';
  if (!authorization.startsWith(prefix)) return null;
  const token = authorization.slice(prefix.length).trim();
  return token || null;
}

/**
 * Verifies Supabase JWT using the service client and attaches `req.user`.
 */
export async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    req.user = user;
    req.accessToken = token;
    next();
  } catch (e) {
    next(e);
  }
}
