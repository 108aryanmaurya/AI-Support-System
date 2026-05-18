import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { sanitizeMessage } from '../utils/incomingMessageValidation.js';
import { readResendConfig } from './emailOutbound.service.js';
import { resolveOrganizationEmailChannel } from './emailWebhook.service.js';

const RECEIVED_FETCH_TIMEOUT_MS = 15_000;

function htmlToPlainText(html) {
  if (typeof html !== 'string' || !html.trim()) return '';
  const stripped = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return sanitizeMessage(stripped);
}

function pickEmailBody(received) {
  const text = typeof received?.text === 'string' ? sanitizeMessage(received.text) : '';
  if (text) return text;
  return htmlToPlainText(received?.html);
}

async function resolveResendApiKeyForRecipient(toEmail) {
  try {
    const { integration } = await resolveOrganizationEmailChannel(toEmail);
    const { apiKey } = readResendConfig(integration.config ?? {});
    if (apiKey) return apiKey;
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
  }
  return env.notificationResendApiKey || '';
}

/**
 * @param {{ apiKey: string, receivedEmailId: string }} params
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function fetchResendReceivedEmail({ apiKey, receivedEmailId }) {
  const id = typeof receivedEmailId === 'string' ? receivedEmailId.trim() : '';
  if (!id || !apiKey) return null;

  const response = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(RECEIVED_FETCH_TIMEOUT_MS),
    },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) return null;
    const message =
      typeof body?.message === 'string'
        ? body.message
        : typeof body?.error === 'string'
          ? body.error
          : 'Failed to load received email from Resend.';
    throw new HttpError(
      typeof response.status === 'number' && response.status >= 400 && response.status < 600
        ? response.status
        : 502,
      message,
    );
  }

  return body && typeof body === 'object' ? body : null;
}

/**
 * Resend `email.received` webhooks omit body text; fetch via Receiving API when needed.
 */
export async function hydrateInboundEmailFromResend(payload, rawBody) {
  if (payload.textBody) return payload;

  const rawType =
    typeof rawBody === 'object' && rawBody !== null && typeof rawBody.type === 'string'
      ? rawBody.type.trim()
      : '';
  const eventType = rawType || payload.eventType || '';
  if (eventType !== 'email.received' || !payload.resendReceivedEmailId) {
    return payload;
  }

  if (env.emailProviderMock) {
    return payload;
  }

  const apiKey = await resolveResendApiKeyForRecipient(payload.toEmail);
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[email-webhook] missing Resend API key; cannot fetch received email body', {
      to_email: payload.toEmail,
      received_email_id: payload.resendReceivedEmailId,
    });
    return payload;
  }

  const received = await fetchResendReceivedEmail({
    apiKey,
    receivedEmailId: payload.resendReceivedEmailId,
  });
  const textBody = pickEmailBody(received);
  if (!textBody) return payload;

  const messageId =
    payload.messageId ||
    (typeof received?.message_id === 'string' ? received.message_id.trim() : '') ||
    payload.resendReceivedEmailId;

  return {
    ...payload,
    textBody,
    messageId,
  };
}
