import { env } from '../config/env.js';

/**
 * Simple transactional email via Resend (no threading headers).
 * Uses NOTIFICATION_RESEND_API_KEY + NOTIFICATION_EMAIL_FROM, or logs when unset / mock.
 *
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string | null }>}
 */
export async function sendNotificationEmailIfConfigured({ to, subject, text }) {
  const toNorm = typeof to === 'string' ? to.trim().toLowerCase() : '';
  const subjectLine = typeof subject === 'string' ? subject.trim() : '';
  const body = typeof text === 'string' ? text.trim() : '';
  const apiKey = env.notificationResendApiKey;
  const from = env.notificationEmailFrom;

  if (!toNorm || !subjectLine || !body) {
    return { ok: false, error: 'to, subject, and text are required.' };
  }

  if (env.emailProviderMock || !apiKey || !from) {
    // eslint-disable-next-line no-console
    console.log(`[notification-email] mock/skip to=${toNorm} subject=${subjectLine}\n${body}`);
    return { ok: true, skipped: true, error: null };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [toNorm],
        subject: subjectLine,
        text: body,
      }),
    });

    const resBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof resBody?.message === 'string' ? resBody.message : resBody?.error || 'Resend API error.';
      return { ok: false, error: message };
    }
    return { ok: true, skipped: false, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Email send failed.';
    return { ok: false, error: message };
  }
}
