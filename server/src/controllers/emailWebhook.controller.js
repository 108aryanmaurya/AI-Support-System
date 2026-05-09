import { HttpError } from '../utils/httpError.js';
import { extractInboundEmailPayload, isValidInboundEmail } from '../utils/emailWebhook.js';
import { processInboundEmail } from '../services/emailWebhook.service.js';

export async function receiveEmailWebhookController(req, res, next) {
  try {
    const payload = extractInboundEmailPayload(req.body);
    if (!isValidInboundEmail(payload)) {
      throw new HttpError(400, 'Invalid inbound email payload.');
    }

    // Ignore empty message bodies to avoid creating empty customer messages.
    if (!payload.textBody) {
      res.status(202).json({ status: 'ignored', reason: 'empty_body' });
      return;
    }

    const result = await processInboundEmail(payload);

    if (result.status === 'duplicate') {
      res.status(200).json({
        status: 'ignored',
        reason: 'duplicate_webhook',
        conversationId: result.duplicate.conversation_id,
        messageId: result.duplicate.id,
      });
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
