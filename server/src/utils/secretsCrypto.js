import crypto from 'node:crypto';
import { env } from '../config/env.js';

const PREFIX = 'enc:v1:';

function encryptionKey() {
  const raw = env.secretsEncryptionKey?.trim();
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/**
 * @param {string} plain
 * @returns {string}
 */
export function encryptSecret(plain) {
  if (!plain || typeof plain !== 'string') return '';
  const key = encryptionKey();
  if (!key) return plain;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

/**
 * @param {string} stored
 * @returns {string}
 */
export function decryptSecret(stored) {
  if (!stored || typeof stored !== 'string') return '';
  if (!stored.startsWith(PREFIX)) return stored;

  const key = encryptionKey();
  if (!key) {
    throw new Error('SECRETS_ENCRYPTION_KEY is required to decrypt stored secrets.');
  }

  const payload = stored.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) return '';

  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const data = Buffer.from(dataB64, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * Decrypt api_key from channel integration config when stored encrypted.
 * @param {string|undefined|null} apiKey
 */
export function decryptConfigApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return '';
  try {
    return decryptSecret(apiKey.trim());
  } catch {
    return '';
  }
}
