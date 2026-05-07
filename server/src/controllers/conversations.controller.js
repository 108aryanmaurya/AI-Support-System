import { HttpError } from '../utils/httpError.js';
import {
  createConversation,
  ensureOrgMembership,
  getPagination,
  listConversations,
  listMessages,
} from '../services/support.service.js';

export async function createConversationController(req, res, next) {
  try {
    const {
      organizationId,
      customerId,
      assignedToMemberId,
      source = 'chat',
      priority = null,
      metadata = {},
    } = req.body ?? {};

    if (!organizationId || !customerId) {
      throw new HttpError(400, 'organizationId and customerId are required.');
    }

    await ensureOrgMembership(req.user.id, organizationId);
    const conversation = await createConversation({
      organizationId,
      customerId,
      assignedToMemberId,
      source,
      priority,
      metadata,
      createdByUserId: req.user.id,
    });

    res.status(201).json({ conversation });
  } catch (error) {
    next(error);
  }
}

export async function getConversationsController(req, res, next) {
  try {
    const organizationId = req.query.organizationId;
    if (!organizationId) throw new HttpError(400, 'organizationId query param is required.');

    await ensureOrgMembership(req.user.id, organizationId);
    const pagination = getPagination(req.query);
    const result = await listConversations({ organizationId, ...pagination });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getConversationMessagesController(req, res, next) {
  try {
    const conversationId = req.params.id;
    const organizationId = req.query.organizationId;
    if (!organizationId) throw new HttpError(400, 'organizationId query param is required.');
    if (!conversationId) throw new HttpError(400, 'conversation id is required.');

    await ensureOrgMembership(req.user.id, organizationId);
    const pagination = getPagination(req.query);
    const result = await listMessages({
      organizationId,
      conversationId,
      ...pagination,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}
