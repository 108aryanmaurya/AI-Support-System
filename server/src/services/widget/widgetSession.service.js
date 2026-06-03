import { supabaseAdmin } from '../../config/supabase.js';
import { widgetConfig } from '../../config/widget.config.js';
import { HttpError } from '../../utils/httpError.js';
import { signWidgetJwt, verifyWidgetJwt } from '../../utils/widgetJwt.js';

/**
 * @param {object} params
 */
export async function createWidgetSession({ visitor, installation, conversationId = null }) {
  const expiresAt = new Date(Date.now() + widgetConfig.sessionTtlSec * 1000).toISOString();

  const { data: sessionRow, error } = await supabaseAdmin
    .from('widget_sessions')
    .insert({
      visitor_id: visitor.id,
      organization_id: installation.organization_id,
      conversation_id: conversationId,
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to create widget session.');

  const token = signWidgetJwt(
    {
      sub: visitor.id,
      sid: sessionRow.id,
      org: installation.organization_id,
      inst: installation.id,
      conv: conversationId,
      typ: 'widget_session',
    },
    widgetConfig.jwtSecret,
    widgetConfig.sessionTtlSec,
  );

  return {
    session: sessionRow,
    sessionToken: token,
    expiresAt,
  };
}

/**
 * @param {string} bearerToken
 */
export async function resolveWidgetSessionFromToken(bearerToken) {
  const raw = bearerToken?.startsWith('Bearer ') ? bearerToken.slice(7).trim() : bearerToken?.trim();
  const claims = verifyWidgetJwt(raw, widgetConfig.jwtSecret);
  if (!claims || typeof claims.sub !== 'string' || typeof claims.sid !== 'string') {
    throw new HttpError(401, 'Invalid or expired widget session.');
  }

  const { data: sessionRow, error: sessErr } = await supabaseAdmin
    .from('widget_sessions')
    .select('*')
    .eq('id', claims.sid)
    .eq('visitor_id', claims.sub)
    .maybeSingle();

  if (sessErr) throw new HttpError(500, sessErr.message || 'Failed to load session.');
  if (!sessionRow) throw new HttpError(401, 'Widget session not found.');
  if (sessionRow.revoked_at) throw new HttpError(401, 'Widget session revoked.');
  if (new Date(sessionRow.expires_at).getTime() < Date.now()) {
    throw new HttpError(401, 'Widget session expired.');
  }

  const { data: visitor, error: visErr } = await supabaseAdmin
    .from('widget_visitors')
    .select('*')
    .eq('id', claims.sub)
    .maybeSingle();

  if (visErr) throw new HttpError(500, visErr.message || 'Failed to load visitor.');
  if (!visitor) throw new HttpError(401, 'Visitor not found.');

  const { data: installation, error: instErr } = await supabaseAdmin
    .from('widget_installations')
    .select('*')
    .eq('id', visitor.installation_id)
    .maybeSingle();

  if (instErr) throw new HttpError(500, instErr.message || 'Failed to load installation.');
  if (!installation || installation.status !== 'active') {
    throw new HttpError(403, 'Widget installation is disabled.');
  }

  return { claims, session: sessionRow, visitor, installation };
}

export async function refreshWidgetSession({ session, visitor, installation }) {
  const maxAgeMs = widgetConfig.sessionRefreshMaxSec * 1000;
  const createdMs = new Date(session.created_at).getTime();
  if (Date.now() - createdMs > maxAgeMs) {
    throw new HttpError(401, 'Visitor session expired; bootstrap again.');
  }

  await supabaseAdmin
    .from('widget_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', session.id);

  return createWidgetSession({
    visitor,
    installation,
    conversationId: session.conversation_id,
  });
}

export async function updateSessionConversationId(sessionId, conversationId) {
  await supabaseAdmin
    .from('widget_sessions')
    .update({ conversation_id: conversationId })
    .eq('id', sessionId);
}
