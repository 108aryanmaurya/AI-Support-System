import { HttpError } from '../utils/httpError.js';
import { verifyResendWebhookPayload } from '../utils/resendWebhookVerify.js';
import { extractInboundEmailPayload, isValidInboundEmail } from '../utils/emailWebhook.js';
import { hydrateInboundEmailFromResend } from '../services/resendReceivedEmail.service.js';
import { processInboundEmail } from '../services/emailWebhook.service.js';
import { handleResendDomainWebhook } from '../services/orgEmailSettings.service.js';

/**
 * Unified Resend webhook (email.received, domain.updated, domain.verified, …).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function receiveResendWebhookController(req, res, next) {
  try {
    const rawBody =
      typeof req.rawBody === 'string'
        ? req.rawBody
        : Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString('utf8')
          : JSON.stringify(req.body ?? {});

    const event = verifyResendWebhookPayload(rawBody, req.headers, req.body);
    const eventType = typeof event?.type === 'string' ? event.type : '';

    if (eventType.startsWith('domain.')) {
      const domainId =
        typeof event?.data?.id === 'string'
          ? event.data.id
          : typeof event?.data?.domain_id === 'string'
            ? event.data.domain_id
            : '';
      await handleResendDomainWebhook(domainId);
      res.status(200).json({ status: 'ok', type: eventType });
      return;
    }

    if (eventType === 'email.received') {
      const envelope = event?.data && typeof event.data === 'object' ? event.data : event;
      let payload = extractInboundEmailPayload(envelope);
      if (!isValidInboundEmail(payload)) {
        payload = extractInboundEmailPayload(req.body);
      }
      if (!isValidInboundEmail(payload)) {
        throw new HttpError(400, 'Invalid inbound email payload.');
      }

      payload = await hydrateInboundEmailFromResend(payload, envelope);

      if (!payload.textBody) {
        res.status(202).json({ status: 'ignored', reason: 'empty_body' });
        return;
      }

      const result = await processInboundEmail(payload);

      if (result.status === 'duplicate') {
        res.status(200).json({
          status: 'ignored',
          reason: result.reason ?? 'duplicate_webhook',
          conversationId: result.duplicate.conversation_id,
          messageId: result.duplicate.id,
        });
        return;
      }

      if (result.status === 'spam_rejected') {
        res.status(422).json({
          status: 'rejected',
          reason: 'ingress_spam_policy',
        });
        return;
      }

      res.status(201).json(result);
      return;
    }

    res.status(200).json({ status: 'ignored', type: eventType || 'unknown' });
  } catch (error) {
    next(error);
  }
}
