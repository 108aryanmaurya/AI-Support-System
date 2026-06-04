import { createHmac, timingSafeEqual } from 'node:crypto';
import { widgetConfig } from '../config/widget.config.js';

export const WIDGET_USER_JWT_TYP = 'widget_user';

function base64urlEncode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

/**
 * Sign a host-site user JWT (HS256). Customer backends use the installation secret.
 *
 * @param {{
 *   userId: string,
 *   email?: string | null,
 *   name?: string | null,
 *   attributes?: Record<string, unknown>,
 * }} params
 * @param {string} secret Installation secret (wks_…)
 * @param {number} [expiresInSec]
 */
export function signWidgetUserJwt(
  { userId, email = null, name = null, attributes = null },
  secret,
  expiresInSec = widgetConfig.userJwtDefaultTtlSec,
) {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!normalizedUserId) throw new Error('userId is required to sign widget user JWT.');

  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    typ: WIDGET_USER_JWT_TYP,
    sub: normalizedUserId,
    user_id: normalizedUserId,
    iat: now,
    exp: now + expiresInSec,
    iss: widgetConfig.jwtIssuer,
  };
  if (typeof email === 'string' && email.trim()) {
    body.email = email.trim().toLowerCase();
  }
  if (typeof name === 'string' && name.trim()) {
    body.name = name.trim();
  }
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    body.attributes = attributes;
  }

  const headerPart = base64urlEncode(JSON.stringify(header));
  const payloadPart = base64urlEncode(JSON.stringify(body));
  const data = `${headerPart}.${payloadPart}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @param {{ maxTtlSec?: number }} [options]
 * @returns {Record<string, unknown> | null}
 */
export function verifyWidgetUserJwt(token, secret, options = {}) {
  if (typeof token !== 'string' || !token.trim() || typeof secret !== 'string' || !secret) {
    return null;
  }
  const raw = token.trim();
  const parts = raw.split('.');
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, sigPart] = parts;
  const data = `${headerPart}.${payloadPart}`;
  const expected = createHmac('sha256', secret).update(data).digest('base64url');
  try {
    const a = Buffer.from(sigPart, 'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadPart));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (payload.typ !== WIDGET_USER_JWT_TYP) return null;

  const maxTtlSec = options.maxTtlSec ?? widgetConfig.userJwtMaxTtlSec;
  if (typeof payload.iat === 'number' && payload.exp - payload.iat > maxTtlSec) {
    return null;
  }

  const userId =
    (typeof payload.sub === 'string' && payload.sub.trim()) ||
    (typeof payload.user_id === 'string' && payload.user_id.trim()) ||
    '';
  if (!userId) return null;

  return { ...payload, sub: userId.trim(), user_id: userId.trim() };
}

/**
 * @param {Record<string, unknown>} claims
 */
export function claimsToIdentifyFields(claims) {
  const userId =
    (typeof claims.sub === 'string' && claims.sub.trim()) ||
    (typeof claims.user_id === 'string' && claims.user_id.trim()) ||
    '';
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : null;
  const name = typeof claims.name === 'string' ? claims.name.trim() : null;
  const attributes =
    claims.attributes && typeof claims.attributes === 'object' && !Array.isArray(claims.attributes)
      ? claims.attributes
      : null;
  return { userId, email, name, attributes };
}
