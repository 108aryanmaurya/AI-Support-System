import { isValidEmail, normalizeEmail, sanitizeMessage } from './incomingMessageValidation.js';

const SUBJECT_PREFIX_REGEX = /^(re|fw|fwd)\s*:\s*/i;

function readString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function pickFirstString(values) {
  for (const value of values) {
    const parsed = readString(value);
    if (parsed) return parsed;
  }
  return '';
}

function pickFirstArrayValue(values) {
  for (const value of values) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const first = readString(value[0]);
    if (first) return first;
  }
  return '';
}

export function normalizeSubject(subject) {
  let normalized = readString(subject);
  while (SUBJECT_PREFIX_REGEX.test(normalized)) {
    normalized = normalized.replace(SUBJECT_PREFIX_REGEX, '').trim();
  }
  return normalized;
}

export function extractInboundEmailPayload(body) {
  const payload = body ?? {};
  const eventData = payload.data ?? {};
  const fromEmail = normalizeEmail(
    pickFirstString([
      payload.from_email,
      payload.from?.email,
      payload.sender?.email,
      eventData.from,
      payload.from,
    ]),
  );
  const fromName = pickFirstString([
    payload.from_name,
    payload.from?.name,
    payload.sender?.name,
  ]);
  const toEmail = normalizeEmail(
    pickFirstString([
      payload.to_email,
      payload.to?.email,
      payload.recipient,
      eventData.to?.[0],
      pickFirstArrayValue([eventData.to]),
      payload.to,
    ]),
  );
  const subject = pickFirstString([payload.subject, payload.headers?.subject, eventData.subject]);
  const textBody = sanitizeMessage(
    pickFirstString([
      payload.text_body,
      payload.text,
      payload.body?.text,
      eventData.text,
      eventData.html,
      payload.body,
      payload.message,
    ]),
  );
  const messageId = pickFirstString([
    payload.message_id,
    payload.headers?.message_id,
    payload.messageId,
    eventData.message_id,
  ]);
  const resendReceivedEmailId = pickFirstString([
    eventData.email_id,
    payload.email_id,
    payload.received_email_id,
  ]);
  const eventType = pickFirstString([payload.type]);
  const inReplyTo = pickFirstString([
    payload.in_reply_to,
    payload.headers?.in_reply_to,
    eventData.in_reply_to,
    payload.inReplyTo,
  ]);

  return {
    fromEmail,
    fromName,
    toEmail,
    subject,
    normalizedSubject: normalizeSubject(subject),
    textBody,
    messageId,
    resendReceivedEmailId,
    eventType,
    inReplyTo,
  };
}

export function isValidInboundEmail(payload) {
  if (!payload) return false;
  return isValidEmail(payload.fromEmail) && isValidEmail(payload.toEmail);
}

export function resolveThreadLookupKey({ inReplyTo, normalizedSubject }) {
  return readString(inReplyTo) || readString(normalizedSubject);
}
