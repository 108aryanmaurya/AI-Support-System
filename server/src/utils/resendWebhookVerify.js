import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from './httpError.js';

const TOLERANCE_SEC = 300;

/**
 * Verify Resend (Svix) webhook signature. Returns parsed JSON payload.
 * @param {string} rawBody
 * @param {import('express').Request['headers']} headers
 */
/**
 * @param {string} rawBody
 * @param {import('express').Request['headers']} headers
 * @param {unknown} [parsedBody]
 */
export function verifyResendWebhookPayload(rawBody, headers, parsedBody) {
  const secret = env.resendWebhookSecret?.trim();
  if (!secret) {
    if (env.nodeEnv === 'production') {
      throw new HttpError(503, 'Webhook verification is not configured.');
    }
    if (parsedBody && typeof parsedBody === 'object') {
      return parsedBody;
    }
    try {
      return JSON.parse(rawBody || '{}');
    } catch {
      throw new HttpError(400, 'Invalid webhook JSON payload.');
    }
  }

  const msgId = headerValue(headers, 'svix-id');
  const msgTimestamp = headerValue(headers, 'svix-timestamp');
  const msgSignature = headerValue(headers, 'svix-signature');

  if (!msgId || !msgTimestamp || !msgSignature) {
    throw new HttpError(401, 'Missing webhook signature headers.');
  }

  const ts = Number(msgTimestamp);
  if (!Number.isFinite(ts)) {
    throw new HttpError(401, 'Invalid webhook timestamp.');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > TOLERANCE_SEC) {
    throw new HttpError(401, 'Webhook timestamp outside tolerance.');
  }

  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;
  const secretPart = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const key = Buffer.from(secretPart, 'base64');
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');

  const parts = msgSignature.split(' ');
  let valid = false;
  for (const part of parts) {
    const comma = part.indexOf(',');
    if (comma === -1) continue;
    const version = part.slice(0, comma);
    const sig = part.slice(comma + 1);
    if (version !== 'v1' || !sig) continue;
    try {
      if (
        sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
      ) {
        valid = true;
        break;
      }
    } catch {
      // length mismatch
    }
  }

  if (!valid) {
    throw new HttpError(401, 'Invalid webhook signature.');
  }

  try {
    return JSON.parse(rawBody || '{}');
  } catch {
    throw new HttpError(400, 'Invalid webhook JSON payload.');
  }
}

/**
 * @param {import('express').Request['headers']} headers
 * @param {string} name
 */
function headerValue(headers, name) {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? '';
  return typeof v === 'string' ? v : '';
}
