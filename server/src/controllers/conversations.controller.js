import { HttpError } from '../utils/httpError.js';
import { isConversationPriority } from '@ai-support/shared';
import {
  CONVERSATION_INBOX_FILTER_TYPES,
  getConversationFilterCounts,
  getFilteredConversations,
} from '../services/conversationInboxFilters.service.js';
import {
  createConversation,
  getPagination,
  listMessages,
  listOrganizationMembersWithProfiles,
  updateConversationSpam,
} from '../services/support.service.js';
import { updateConversationFields } from '../services/conversationUpdate.service.js';
import { notifyConversationAssignee } from '../services/conversationAssignmentNotification.service.js';

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
  return id;
}

export async function createConversationController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const {
      customerId,
      assignedToMemberId,
      source = 'chat',
      channelType = null,
      channelId = null,
      priority = null,
      metadata = {},
    } = req.body ?? {};

    if (!customerId) {
      throw new HttpError(400, 'customerId is required.');
    }

    if (priority != null && priority !== '' && !isConversationPriority(String(priority).trim())) {
      throw new HttpError(
        400,
        'priority must be one of: low, medium, high, urgent.',
      );
    }

    const conversation = await createConversation({
      organizationId,
      customerId,
      assignedToMemberId,
      source,
      channelType,
      channelId,
      priority,
      metadata,
      createdByUserId: req.userId ?? req.user.id,
    });

    res.status(201).json({ conversation });
  } catch (error) {
    next(error);
  }
}

export async function getConversationsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);

    const rawFilter = req.query.filter ?? req.query.filterType ?? 'all';
    const filterType = String(rawFilter).trim().toLowerCase().replace(/-/g, '_');
    if (!CONVERSATION_INBOX_FILTER_TYPES.includes(filterType)) {
      throw new HttpError(
        400,
        `Invalid filter. Use one of: ${CONVERSATION_INBOX_FILTER_TYPES.join(', ')}.`,
      );
    }

    const includeSpam =
      req.query.includeSpam === 'true' || req.query.includeSpam === '1';

    const pagination = getPagination(req.query);
    const result = await getFilteredConversations({
      filterType,
      currentUserId: req.userId ?? req.user.id,
      organizationId,
      includeSpam,
      ...pagination,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getConversationCountsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);

    const counts = await getConversationFilterCounts({
      currentUserId: req.userId ?? req.user.id,
      organizationId,
    });
    res.json(counts);
  } catch (error) {
    next(error);
  }
}

export async function patchConversationSpamController(req, res, next) {
  try {
    const conversationId = req.params.id;
    const organizationId = orgIdOrThrow(req);
    if (!conversationId) throw new HttpError(400, 'conversation id is required.');

    const body = req.body ?? {};
    if (!Object.prototype.hasOwnProperty.call(body, 'is_spam')) {
      throw new HttpError(400, 'is_spam is required.');
    }
    const { is_spam: isSpam } = body;
    if (typeof isSpam !== 'boolean') {
      throw new HttpError(400, 'is_spam must be a boolean.');
    }

    const conversation = await updateConversationSpam({
      organizationId,
      conversationId,
      isSpam,
      actorUserId: req.userId ?? req.user.id,
    });

    res.json({ conversation });
  } catch (error) {
    next(error);
  }
}

export async function patchConversationController(req, res, next) {
  try {
    const conversationId = req.params.id;
    const organizationId = orgIdOrThrow(req);
    if (!conversationId) throw new HttpError(400, 'conversation id is required.');

    const body = req.body ?? {};
    const hasAssign = Object.prototype.hasOwnProperty.call(body, 'assignedToMemberId');
    const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
    const hasPriority = Object.prototype.hasOwnProperty.call(body, 'priority');
    const hasAssignmentType = Object.prototype.hasOwnProperty.call(body, 'assignmentType');

    if (!hasAssign && !hasStatus && !hasPriority && !hasAssignmentType) {
      throw new HttpError(
        400,
        'Provide at least one of: assignedToMemberId, status, priority, assignmentType.',
      );
    }

    let assignedToMemberId = undefined;
    if (hasAssign) {
      const v = body.assignedToMemberId;
      if (v !== null && typeof v !== 'string') {
        throw new HttpError(400, 'assignedToMemberId must be a uuid string or null.');
      }
      assignedToMemberId = v;
    }

    const { conversation, priorAssignedToMemberId } = await updateConversationFields({
      organizationId,
      conversationId,
      actorUserId: req.userId ?? req.user.id,
      assignedToMemberId: hasAssign ? assignedToMemberId : undefined,
      status: hasStatus ? body.status : undefined,
      priority: hasPriority ? body.priority : undefined,
      assignmentType: hasAssignmentType ? body.assignmentType : undefined,
    });

    if (hasAssign) {
      void notifyConversationAssignee({
        organizationId,
        conversation,
        assignedToMemberId: conversation.assigned_to_member_id ?? null,
        actorUserId: req.userId ?? req.user.id,
        priorAssignedToMemberId,
      });
    }

    res.json({ conversation });
  } catch (error) {
    next(error);
  }
}

export async function listOrganizationMembersController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);

    const members = await listOrganizationMembersWithProfiles({
      organizationId,
      actorUserId: req.userId ?? req.user.id,
    });
    res.json({ members });
  } catch (error) {
    next(error);
  }
}

export async function getConversationMessagesController(req, res, next) {
  try {
    const conversationId = req.params.id;
    const organizationId = orgIdOrThrow(req);
    if (!conversationId) throw new HttpError(400, 'conversation id is required.');

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
