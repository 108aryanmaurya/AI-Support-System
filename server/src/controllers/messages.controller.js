import { HttpError } from '../utils/httpError.js';
import { createMessage, ensureOrgMembership } from '../services/support.service.js';

export async function createMessageController(req, res, next) {
  try {
    const {
      organizationId,
      conversationId,
      senderType = 'agent',
      senderMemberId = null,
      content,
      metadata = {},
    } = req.body ?? {};

    if (!organizationId || !conversationId) {
      throw new HttpError(400, 'organizationId and conversationId are required.');
    }

    const member = await ensureOrgMembership(req.user.id, organizationId);
    const resolvedSenderMemberId = senderType === 'agent' ? senderMemberId ?? member.id : senderMemberId;

    const message = await createMessage({
      organizationId,
      conversationId,
      senderType,
      senderUserId: senderType === 'agent' ? req.user.id : null,
      senderMemberId: resolvedSenderMemberId,
      content,
      metadata,
    });

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
}
