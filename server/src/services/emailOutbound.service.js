import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { decryptConfigApiKey } from '../utils/secretsCrypto.js';

function isMissingColumnError(error, column) {
  if (!error) return false;
  const message = `${error.message || ''} ${error.details || ''}`;
  return message.includes(`'${column}'`) && message.toLowerCase().includes('column');
}

function readConfigString(config, keys) {
  for (const key of keys) {
    const value = config?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function readResendConfig(config) {
  const rawKey = readConfigString(config, ['api_key', 'resend_api_key', 'token']);
  const apiKey = decryptConfigApiKey(rawKey);
  const fromEmail = readConfigString(config, [
    'from_email',
    'reply_from',
    'support_email',
    'to_email',
    'inbound_email',
  ]);
  return { apiKey, fromEmail };
}

/**
 * Loads customer row; does NOT throw when email absent (caller returns send failure instead).
 */
export async function fetchReplyCustomer(organizationId, customerId) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, email, name')
    .eq('organization_id', organizationId)
    .eq('id', customerId)
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load customer.');
  if (!data) throw new HttpError(404, 'Conversation customer not found.');
  return data;
}

async function fetchLastCustomerInboundExternalId(organizationId, conversationId) {
  const { data: lastInbound, error: inboundError } = await supabaseAdmin
    .from('messages')
    .select('metadata')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inboundError) {
    throw new HttpError(500, inboundError.message || 'Failed to load threading headers.');
  }

  if (typeof lastInbound?.metadata?.external_message_id === 'string') {
    return lastInbound.metadata.external_message_id.trim() || null;
  }
  return null;
}

/**
 * Prefer `email_threads.last_message_id` → message.metadata.external_message_id for threading.
 */
export async function resolveEmailReferencesHeaders(organizationId, conversationId) {
  let thread = null;

  let { data: threadRow, error: threadError } = await supabaseAdmin
    .from('email_threads')
    .select('last_message_id, thread_key, subject')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (threadError && isMissingColumnError(threadError, 'subject')) {
    const res = await supabaseAdmin
      .from('email_threads')
      .select('last_message_id, thread_key')
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    threadError = res.error;
    threadRow = res.data;
  }

  if (threadError && isMissingColumnError(threadError, 'last_message_id')) {
    const res = await supabaseAdmin
      .from('email_threads')
      .select('thread_key, subject')
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (res.error) throw new HttpError(500, res.error.message || 'Failed to load email thread.');
    threadRow = res.data ?? null;
    threadError = null;
  } else if (threadError) {
    throw new HttpError(500, threadError.message || 'Failed to load email thread.');
  }

  thread = threadRow;

  let anchorRaw = null;
  /** Optional prior References chain copied from inbound message metadata when present */
  let priorReferencesRaw = null;
  if (thread?.last_message_id) {
    const { data: refMsg, error: refErr } = await supabaseAdmin
      .from('messages')
      .select('metadata')
      .eq('organization_id', organizationId)
      .eq('id', thread.last_message_id)
      .limit(1)
      .maybeSingle();

    if (refErr) {
      throw new HttpError(500, refErr.message || 'Failed to load reference message.');
    }
    anchorRaw =
      typeof refMsg?.metadata?.external_message_id === 'string'
        ? refMsg.metadata.external_message_id.trim()
        : null;
    if (typeof refMsg?.metadata?.references_chain === 'string') {
      priorReferencesRaw = refMsg.metadata.references_chain.trim();
    }
  }

  if (!anchorRaw) {
    anchorRaw = await fetchLastCustomerInboundExternalId(organizationId, conversationId);
  }

  const threadSubject = typeof thread?.subject === 'string' ? thread.subject.trim() || null : null;
  const threadKey = typeof thread?.thread_key === 'string' ? thread.thread_key.trim() || null : null;

  return {
    anchorRaw,
    priorReferencesRaw,
    threadSubject,
    threadKey,
  };
}

function normalizeMessageId(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith('<') && t.endsWith('>')) return t;
  return `<${t}>`;
}

function referencesHeaderFromAnchors(primary, chainFromMetadata = null) {
  const normalizedPrimary = normalizeMessageId(primary);
  if (!normalizedPrimary) return null;

  if (typeof chainFromMetadata !== 'string' || !chainFromMetadata.trim()) {
    return normalizedPrimary;
  }

  const parts = `${chainFromMetadata} ${normalizedPrimary}`.trim().split(/\s+/);
  const normalizedTokens = [];
  const seen = new Set();
  for (const segment of parts) {
    const n = normalizeMessageId(segment.replace(/,/g, ' '));
    if (n && !seen.has(n)) {
      seen.add(n);
      normalizedTokens.push(n);
    }
  }
  return normalizedTokens.length ? normalizedTokens.join(' ') : normalizedPrimary;
}

async function fetchChannelIntegration(channelId) {
  const { data, error } = await supabaseAdmin
    .from('channel_integrations')
    .select('id, provider, config')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load channel integration.');
  if (!data) throw new HttpError(404, 'No channel integration configured for this conversation channel.');
  return data;
}

async function httpSendResend({
  apiKey,
  fromEmail,
  toEmail,
  subject,
  text,
  inReplyTo,
  references,
  threadKey,
}) {
  const headers = {};
  const inNorm = normalizeMessageId(inReplyTo);
  const trimmedRefs = typeof references === 'string' ? references.trim() : '';
  const referencesHeader =
    trimmedRefs !== '' ? trimmedRefs : (inNorm ?? undefined);

  if (inNorm) {
    headers['In-Reply-To'] = inNorm;
  }
  if (referencesHeader) {
    headers.References = referencesHeader;
  }
  if (typeof threadKey === 'string' && threadKey.trim()) {
    headers['X-Thread-Key'] = threadKey.trim();
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject,
      text,
      headers,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.message === 'string' ? body.message : body?.error;
    throw new HttpError(typeof response.status === 'number' ? response.status : 502, message || 'Resend API error.');
  }

  const external =
    typeof body?.id === 'string'
      ? body.id
      : typeof body?.data?.id === 'string'
        ? body.data.id
        : null;

  return { external_message_id: external, rawBody: body };
}

/**
 * Resend-backed send (or mock). Returns `{ ok, external_message_id, error }` — does not persist messages.
 */
export async function sendEmailViaProvider({
  conversation,
  customer,
  message: messageBody,
}) {
  const text = typeof messageBody === 'string' ? messageBody.trim() : '';

  try {
    if (!text) {
      return {
        ok: false,
        external_message_id: null,
        provider: env.emailProvider,
        error: 'message cannot be empty.',
      };
    }

    if (conversation.channel_type !== 'email') {
      return {
        ok: false,
        external_message_id: null,
        provider: env.emailProvider,
        error: 'Conversation is not an email channel.',
      };
    }

    if (!conversation.channel_id) {
      return {
        ok: false,
        external_message_id: null,
        provider: env.emailProvider,
        error: 'Conversation is missing channel_id.',
      };
    }

    const recipient =
      typeof customer?.email === 'string' ? customer.email.trim().toLowerCase() : '';
    if (!recipient) {
      return {
        ok: false,
        external_message_id: null,
        provider: env.emailProvider,
        error: 'Customer email is missing.',
      };
    }

    const routing = await resolveEmailReferencesHeaders(conversation.organization_id, conversation.id);
    const inReplyTarget = routing.anchorRaw;
    const referencesForHeader =
      referencesHeaderFromAnchors(inReplyTarget, routing.priorReferencesRaw) ??
      normalizeMessageId(inReplyTarget);

    const subjectLine =
      (typeof conversation.subject === 'string' && conversation.subject.trim()) ||
      routing.threadSubject ||
      'Support reply';

    if (env.emailProviderMock || env.emailProvider === 'mock') {
      const pseudoId =
        typeof globalThis.crypto?.randomUUID === 'function'
          ? `mock_${globalThis.crypto.randomUUID()}`
          : `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      return {
        ok: true,
        external_message_id: pseudoId,
        provider: 'mock',
        error: null,
      };
    }

    const integration = await fetchChannelIntegration(conversation.channel_id);
    const providerNorm = integration.provider ?? 'unknown';

    if (providerNorm !== 'resend') {
      return {
        ok: false,
        external_message_id: null,
        provider: providerNorm,
        error: `Outbound provider '${providerNorm}' is not implemented.`,
      };
    }

    const config = integration.config ?? {};
    if (config.setup_mode === 'forwarding' && config.sending_verified === false) {
      return {
        ok: false,
        external_message_id: null,
        provider: providerNorm,
        error:
          'Outbound email is not ready. Complete sending domain DNS in Settings → Email (Channels).',
      };
    }

    const { apiKey, fromEmail } = readResendConfig(config);
    if (!apiKey || !fromEmail) {
      return {
        ok: false,
        external_message_id: null,
        provider: providerNorm,
        error: !apiKey ? 'Missing Resend API key in integration config.' : 'Missing outbound from_email.',
      };
    }

    const { external_message_id: externalId } = await httpSendResend({
      apiKey,
      fromEmail,
      toEmail: recipient,
      subject: subjectLine,
      text,
      inReplyTo: inReplyTarget,
      references: referencesForHeader ?? undefined,
      threadKey: routing.threadKey ?? undefined,
    });

    return {
      ok: true,
      external_message_id: externalId,
      provider: providerNorm,
      error: null,
    };
  } catch (e) {
    const message =
      e instanceof HttpError ? e.message : e instanceof Error ? e.message : 'Email send failed.';
    return {
      ok: false,
      external_message_id: null,
      provider: env.emailProvider ?? 'unknown',
      error: message,
    };
  }
}