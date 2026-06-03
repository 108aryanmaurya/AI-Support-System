import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  WIDGET_KEY_PREFIX_LIVE,
  WIDGET_KEY_PREFIX_TEST,
  WIDGET_SECRET_PREFIX,
  WIDGET_VISITOR_TOKEN_BYTES,
} from '@ai-support/shared';

export function generateWidgetKey(testMode = false) {
  const prefix = testMode ? WIDGET_KEY_PREFIX_TEST : WIDGET_KEY_PREFIX_LIVE;
  return `${prefix}${randomBytes(16).toString('hex')}`;
}

export function generateWidgetSecret() {
  return `${WIDGET_SECRET_PREFIX}${randomBytes(24).toString('hex')}`;
}

export function generateVisitorToken() {
  return randomBytes(WIDGET_VISITOR_TOKEN_BYTES).toString('hex');
}

/**
 * @param {string} secret
 */
export function hashWidgetSecret(secret) {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * @param {string} secret
 * @param {string} stored
 */
export function verifyWidgetSecret(secret, stored) {
  if (typeof secret !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = scryptSync(secret, salt, 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * @param {string} secret
 * @param {string} userId
 * @param {string} email
 */
export function computeIdentifyHmac(secret, userId, email) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUserId = userId.trim();
  return createHmac('sha256', secret)
    .update(`${normalizedUserId}:${normalizedEmail}`)
    .digest('hex');
}

/**
 * @param {string} provided
 * @param {string} expected
 */
export function verifyIdentifyHmac(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/**
 * @param {string} ip
 */
export function hashIp(ip) {
  if (!ip) return null;
  return createHmac('sha256', 'widget-ip-salt').update(ip).digest('hex').slice(0, 32);
}

/** Synthetic email for anonymous widget visitors (never used for outbound). */
export function syntheticVisitorEmail(visitorId) {
  return `visitor+${visitorId}@widget.invalid`;
}
