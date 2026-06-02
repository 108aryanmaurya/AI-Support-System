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
  normalizeConversationFilterType,
} from '../services/conversationInboxFilters.service.js';
import {
  createConversation,
  getPagination,
  findOrCreateCustomer,
  listMessages,
  listOrganizationMembersWithProfiles,
  updateConversationSpam,
} from '../services/support.service.js';
import { updateConversationFields } from '../services/conversationUpdate.service.js';
import { scheduleAssignmentWithFallback } from '../services/automation/automationNotify.service.js';
import { setConversationTags } from '../services/tags.service.js';
import { createMessage } from '../services/support.service.js';
import { replaceMessageMetadataExact, syncEmailThreadsLastMessageId } from '../services/emailOutboundDbSync.service.js';
import { sendEmailViaProvider, fetchReplyCustomer } from '../services/emailOutbound.service.js';
import { normalizeEmail, isValidEmail, sanitizeMessage, getMaxMessageLength } from '../utils/incomingMessageValidation.js';

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
      subject = null,
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
      subject,
    });

    res.status(201).json({ conversation });
  } catch (error) {
    next(error);
  }
}

const MAX_MESSAGE_LENGTH = getMaxMessageLength();

function parseEmailList(value) {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : String(value).split(/[,\n]/g);
  const out = [];
  for (const seg of raw) {
    const e = normalizeEmail(seg);
    if (e && isValidEmail(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

export async function composeConversationAndSendController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = req.userId ?? req.user.id;
    const actorMemberId = req.orgMembership?.id ?? null;
    if (!actorMemberId) {
      throw new HttpError(500, 'Organization membership missing (middleware misconfigured).');
    }

    const {
      channel = 'email', // 'email' | 'chat'
      to,
      cc,
      bcc,
      subject,
      body,
      assignedToMemberId = null,
      teamInboxId = null,
    } = req.body ?? {};

    const channelNorm = String(channel || '').trim().toLowerCase();
    if (channelNorm !== 'email' && channelNorm !== 'chat') {
      throw new HttpError(400, "channel must be 'email' or 'chat'.");
    }

    const toList = parseEmailList(to);
    const ccList = parseEmailList(cc);
    const bccList = parseEmailList(bcc);

    if (!toList.length) {
      throw new HttpError(400, 'At least one To email is required.');
    }

    const subjectTrim = typeof subject === 'string' ? subject.trim() : '';
    if (!subjectTrim) {
      throw new HttpError(400, 'Subject is required.');
    }

    if (typeof body !== 'string') {
      throw new HttpError(400, 'Body is required.');
    }
    const sanitizedBody = sanitizeMessage(body);
    if (!sanitizedBody) throw new HttpError(400, 'Body cannot be empty.');
    if (sanitizedBody.length > MAX_MESSAGE_LENGTH) {
      throw new HttpError(400, `Body exceeds max length of ${MAX_MESSAGE_LENGTH} characters.`);
    }

    const primaryEmail = toList[0];
    const customerResult = await findOrCreateCustomer({
      organizationId,
      email: primaryEmail,
      name: null,
      phone: null,
      externalId: null,
      metadata: {},
    });

    const conversation = await createConversation({
      organizationId,
      customerId: customerResult.customer.id,
      assignedToMemberId: assignedToMemberId ?? actorMemberId,
      source: channelNorm === 'email' ? 'email' : 'chat',
      channelType: channelNorm === 'email' ? 'email' : 'web',
      channelId: null,
      priority: null,
      metadata: {
        compose: {
          recipients: { to: toList, cc: ccList, bcc: bccList },
          channel: channelNorm,
        },
        ...(teamInboxId ? { team_inbox_id: teamInboxId } : {}),
      },
      createdByUserId: actorUserId,
      subject: channelNorm === 'email' ? subjectTrim : null,
    });

    if (teamInboxId) {
      await updateConversationFields({
        organizationId,
        conversationId: conversation.id,
        actorUserId,
        teamInboxId,
        assignmentType: 'assigned_to_team',
        orgPermissions: req.orgPermissions,
      });
    }

    const inserted = await createMessage({
      organizationId,
      conversationId: conversation.id,
      senderType: 'agent',
      senderUserId: actorUserId,
      senderMemberId: assignedToMemberId ?? actorMemberId,
      content: sanitizedBody,
      metadata: {
        status: 'pending',
        compose_recipients: { to: toList, cc: ccList, bcc: bccList },
      },
    });

    const customer = await fetchReplyCustomer(organizationId, conversation.customer_id);

    const delivery = await sendEmailViaProvider({
      conversation,
      customer,
      message: sanitizedBody,
      recipients: { to: toList, cc: ccList, bcc: bccList },
      subjectOverride: subjectTrim,
    });

    if (!delivery.ok) {
      await replaceMessageMetadataExact({
        organizationId,
        messageId: inserted.id,
        metadata: {
          ...(inserted.metadata && typeof inserted.metadata === 'object' ? inserted.metadata : {}),
          status: 'failed',
          error: delivery.error || 'Outbound email failed.',
        },
      });
      throw new HttpError(502, delivery.error || 'Outbound email failed.');
    }

    const updated = await replaceMessageMetadataExact({
      organizationId,
      messageId: inserted.id,
      metadata: {
        ...(inserted.metadata && typeof inserted.metadata === 'object' ? inserted.metadata : {}),
        status: 'sent',
        external_message_id: delivery.external_message_id ?? null,
        channel: conversation.channel_type,
        email_delivery: { provider: delivery.provider ?? 'resend' },
      },
    });

    if (conversation.channel_type === 'email' && updated?.id) {
      await syncEmailThreadsLastMessageId({
        organizationId,
        conversationId: conversation.id,
        messageId: updated.id,
      });
    }

    res.status(201).json({ conversation, message: updated });
  } catch (error) {
    next(error);
  }
}

export async function getConversationsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);

    const rawFilter = req.query.filter ?? req.query.filterType ?? 'inbox';
    const filterType = normalizeConversationFilterType(String(rawFilter).trim());
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

    const rawMemberId =
      typeof req.query.memberId === 'string' && req.query.memberId.trim()
        ? req.query.memberId.trim()
        : null;

    const rawChannelId =
      typeof req.query.channelId === 'string' && req.query.channelId.trim()
        ? req.query.channelId.trim()
        : null;

    let scopeInboxId = null;
    if (filterType === 'team_inbox') {
      if (!rawInboxId) {
        throw new HttpError(400, 'inbox query param is required for team_inbox filter.');
      }
      scopeInboxId = await resolveListInboxId({
        inboxId: rawInboxId,
        organizationId,
        membership: req.orgMembership,
        orgPermissions: req.orgPermissions,
      });
    }

    const pagination = getPagination(req.query);
    const result = await getFilteredConversations({
      filterType,
      currentUserId: req.userId ?? req.user.id,
      organizationId,
      scopeInboxId,
      assigneeMemberId: filterType === 'teammate' ? rawMemberId : null,
      channelId: filterType === 'channel' ? rawChannelId : null,
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
    const hasTeamInbox = Object.prototype.hasOwnProperty.call(body, 'teamInboxId');
    const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
    const hasPriority = Object.prototype.hasOwnProperty.call(body, 'priority');
    const hasAssignmentType = Object.prototype.hasOwnProperty.call(body, 'assignmentType');
    const hasAiEnabled = Object.prototype.hasOwnProperty.call(body, 'aiEnabled');
    const hasTagIds = Object.prototype.hasOwnProperty.call(body, 'tagIds');
    const hasWaitingStatus = Object.prototype.hasOwnProperty.call(body, 'waitingStatus');

    if (
      !hasAssign &&
      !hasTeamInbox &&
      !hasStatus &&
      !hasPriority &&
      !hasAssignmentType &&
      !hasAiEnabled &&
      !hasTagIds &&
      !hasWaitingStatus
    ) {
      throw new HttpError(
        400,
        'Provide at least one of: assignedToMemberId, teamInboxId, status, waitingStatus, priority, assignmentType, aiEnabled, tagIds.',
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
        !hasTeamInbox &&
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

    let teamInboxId = undefined;
    if (hasTeamInbox) {
      const v = body.teamInboxId;
      if (v !== null && typeof v !== 'string') {
        throw new HttpError(400, 'teamInboxId must be a uuid string or null.');
      }
      teamInboxId = v;
    }

    const { conversation, priorAssignedToMemberId } = await updateConversationFields({
      organizationId,
      conversationId,
      actorUserId: req.userId ?? req.user.id,
      assignedToMemberId: hasAssign ? assignedToMemberId : undefined,
      teamInboxId: hasTeamInbox ? teamInboxId : undefined,
      status: hasStatus ? body.status : undefined,
      waitingStatus: hasWaitingStatus ? body.waitingStatus : undefined,
      priority: hasPriority ? body.priority : undefined,
      assignmentType: hasAssignmentType ? body.assignmentType : undefined,
      aiEnabled: hasAiEnabled ? body.aiEnabled : undefined,
      orgPermissions: req.orgPermissions,
    });

    if (hasAssign || hasTeamInbox || hasAssignmentType) {
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
