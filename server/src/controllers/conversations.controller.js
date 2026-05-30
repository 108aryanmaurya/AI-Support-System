import { HttpError } from '../utils/httpError.js';
import { isConversationPriority } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import {
  assertCanAccessConversation,
  resolveListInboxId,
} from '../services/inboxAccess.service.js';
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
import { scheduleAssignmentWithFallback } from '../services/automation/automationNotify.service.js';
import { setConversationTags } from '../services/tags.service.js';

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

    const tagId =
      typeof req.query.tagId === 'string' && req.query.tagId.trim()
        ? req.query.tagId.trim()
        : null;

    const aiIntent =
      typeof req.query.aiIntent === 'string' && req.query.aiIntent.trim()
        ? req.query.aiIntent.trim()
        : null;

    const rawInboxId =
      typeof req.query.inboxId === 'string' && req.query.inboxId.trim()
        ? req.query.inboxId.trim()
        : typeof req.query.inbox === 'string' && req.query.inbox.trim()
          ? req.query.inbox.trim()
          : null;

    const inboxId = await resolveListInboxId({
      inboxId: rawInboxId,
      organizationId,
      membership: req.orgMembership,
      orgPermissions: req.orgPermissions,
    });

    const pagination = getPagination(req.query);
    const result = await getFilteredConversations({
      filterType,
      currentUserId: req.userId ?? req.user.id,
      organizationId,
      inboxId,
      includeSpam,
      tagId,
      aiIntent,
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

    const rawInboxId =
      typeof req.query.inboxId === 'string' && req.query.inboxId.trim()
        ? req.query.inboxId.trim()
        : typeof req.query.inbox === 'string' && req.query.inbox.trim()
          ? req.query.inbox.trim()
          : null;

    const inboxId = await resolveListInboxId({
      inboxId: rawInboxId,
      organizationId,
      membership: req.orgMembership,
      orgPermissions: req.orgPermissions,
    });

    const counts = await getConversationFilterCounts({
      currentUserId: req.userId ?? req.user.id,
      organizationId,
      inboxId,
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

    await assertCanAccessConversation({
      organizationId,
      conversationId,
      membership: req.orgMembership,
      orgPermissions: req.orgPermissions,
    });

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
      orgPermissions: req.orgPermissions,
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

    await assertCanAccessConversation({
      organizationId,
      conversationId,
      membership: req.orgMembership,
      orgPermissions: req.orgPermissions,
    });

    const body = req.body ?? {};
    const hasAssign = Object.prototype.hasOwnProperty.call(body, 'assignedToMemberId');
    const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
    const hasPriority = Object.prototype.hasOwnProperty.call(body, 'priority');
    const hasAssignmentType = Object.prototype.hasOwnProperty.call(body, 'assignmentType');
    const hasAiEnabled = Object.prototype.hasOwnProperty.call(body, 'aiEnabled');
    const hasTagIds = Object.prototype.hasOwnProperty.call(body, 'tagIds');
    const hasWaitingStatus = Object.prototype.hasOwnProperty.call(body, 'waitingStatus');

    if (
      !hasAssign &&
      !hasStatus &&
      !hasPriority &&
      !hasAssignmentType &&
      !hasAiEnabled &&
      !hasTagIds &&
      !hasWaitingStatus
    ) {
      throw new HttpError(
        400,
        'Provide at least one of: assignedToMemberId, status, waitingStatus, priority, assignmentType, aiEnabled, tagIds.',
      );
    }

    if (hasTagIds) {
      const tagResult = await setConversationTags({
        organizationId,
        conversationId,
        actorUserId: req.userId ?? req.user.id,
        tagIds: body.tagIds ?? [],
      });
      if (
        !hasAssign &&
        !hasStatus &&
        !hasPriority &&
        !hasAssignmentType &&
        !hasAiEnabled &&
        !hasWaitingStatus
      ) {
        res.json({ conversation: tagResult.conversation, tags: tagResult.tags });
        return;
      }
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
      waitingStatus: hasWaitingStatus ? body.waitingStatus : undefined,
      priority: hasPriority ? body.priority : undefined,
      assignmentType: hasAssignmentType ? body.assignmentType : undefined,
      aiEnabled: hasAiEnabled ? body.aiEnabled : undefined,
      orgPermissions: req.orgPermissions,
    });

    if (hasAssign || hasAssignmentType) {
      void scheduleAssignmentWithFallback({
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

export async function claimConversationController(req, res, next) {
  try {
    const conversationId = req.params.id;
    const organizationId = orgIdOrThrow(req);
    if (!conversationId) throw new HttpError(400, 'conversation id is required.');

    const actorMember = req.orgMembership;
    if (!actorMember?.id) {
      throw new HttpError(500, 'Organization membership missing.');
    }

    await assertCanAccessConversation({
      organizationId,
      conversationId,
      membership: actorMember,
      orgPermissions: req.orgPermissions,
    });

    const { data: prior, error: priorErr } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (priorErr) {
      throw new HttpError(500, priorErr.message || 'Failed to load conversation.');
    }
    if (!prior) {
      throw new HttpError(404, 'Conversation not found in this organization.');
    }

    const priorAssignee = prior.assigned_to_member_id ?? null;
    if (priorAssignee === actorMember.id) {
      res.json({ conversation: prior, claimed: false });
      return;
    }
    if (priorAssignee) {
      throw new HttpError(409, 'Conversation is already assigned to another agent.');
    }

    const { conversation, priorAssignedToMemberId } = await updateConversationFields({
      organizationId,
      conversationId,
      actorUserId: req.userId ?? req.user.id,
      assignedToMemberId: actorMember.id,
      assignmentType: 'assigned_to_agent',
      assignmentMode: 'claim',
      orgPermissions: req.orgPermissions,
    });

    void scheduleAssignmentWithFallback({
      organizationId,
      conversation,
      assignedToMemberId: conversation.assigned_to_member_id ?? null,
      actorUserId: req.userId ?? req.user.id,
      priorAssignedToMemberId,
    });

    res.json({ conversation, claimed: true });
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

    await assertCanAccessConversation({
      organizationId,
      conversationId,
      membership: req.orgMembership,
      orgPermissions: req.orgPermissions,
    });

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
