const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LENGTH = 4000;

export function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

export function isValidEmail(value) {
  return SIMPLE_EMAIL_REGEX.test(value);
}

export function sanitizeMessage(value) {
  if (typeof value !== 'string') return '';
  // Normalize internal whitespace while preserving intentional line breaks.
  const trimmed = value.trim();
  return trimmed
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .trim();
}

export function validateMessageLength(message) {
  return message.length > 0 && message.length <= MAX_MESSAGE_LENGTH;
}

export function getMaxMessageLength() {
  return MAX_MESSAGE_LENGTH;
}

export function maskEmail(email) {
  const normalized = normalizeEmail(email);
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return '';
  const localPrefix = local.slice(0, 1);
  return `${localPrefix}***@${domain}`;
}

export function sanitizeIncomingPayloadForLog({ organizationId, email, message, idempotencyKey, ip }) {
  return {
    organizationId,
    emailMasked: maskEmail(email),
    messagePreview: sanitizeMessage(message).slice(0, 120),
    messageLength: sanitizeMessage(message).length,
    hasIdempotencyKey: Boolean(idempotencyKey),
    ip,
  };
}
