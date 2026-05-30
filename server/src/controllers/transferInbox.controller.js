import { HttpError } from '../utils/httpError.js';
import { transferConversationInbox } from '../services/transferInbox.service.js';

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
  return id;
}

export async function transferConversationInboxController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const conversationId = req.params.conversationId ?? req.params.id;
    const { target_inbox_id: targetInboxId, reason } = req.body ?? {};
    const idempotencyKey =
      typeof req.headers['idempotency-key'] === 'string'
        ? req.headers['idempotency-key'].trim().slice(0, 128)
        : null;

    if (!targetInboxId || typeof targetInboxId !== 'string') {
      throw new HttpError(400, 'target_inbox_id is required.');
    }

    const result = await transferConversationInbox({
      organizationId,
      conversationId,
      targetInboxId: targetInboxId.trim(),
      reason,
      membership: req.orgMembership,
      actorUserId: req.userId ?? req.user?.id,
      idempotencyKey,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}
