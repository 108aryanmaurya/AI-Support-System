import { normalizeEmail } from '../utils/incomingMessageValidation.js';

const ORG_WINDOW_MS = 60_000;
const EMAIL_WINDOW_MS = 60_000;
const ORG_MAX_REQUESTS = 120;
const EMAIL_MAX_REQUESTS = 20;

const orgBuckets = new Map();
const orgEmailBuckets = new Map();

function touchBucket(store, key, now, windowMs) {
  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    store.set(key, next);
    return next;
  }
  existing.count += 1;
  return existing;
}

export function incomingMessageRateLimit(req, res, next) {
  const now = Date.now();
  const organizationId = typeof req.body?.organizationId === 'string' ? req.body.organizationId : '';
  const email = normalizeEmail(req.body?.customer?.email);

  // Scaffold only: skip strict enforcement when key fields are not yet parseable.
  if (!organizationId || !email) return next();

  const orgBucket = touchBucket(orgBuckets, organizationId, now, ORG_WINDOW_MS);
  if (orgBucket.count > ORG_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests for this organization.' });
  }

  const orgEmailKey = `${organizationId}:${email}`;
  const emailBucket = touchBucket(orgEmailBuckets, orgEmailKey, now, EMAIL_WINDOW_MS);
  if (emailBucket.count > EMAIL_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests for this customer email.' });
  }

  return next();
}
