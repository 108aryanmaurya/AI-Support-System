import {
  AGENT_PRESENCE_HEARTBEAT_STATES,
  isAgentPresenceHeartbeatState,
  isWithinAgentShift,
} from '@ai-support/shared';
import { HttpError } from '../utils/httpError.js';
import { getAgentAssignmentConfig } from '../services/assignment/agentProfile.service.js';
import {
  getAgentPresenceForMember,
  listOrgAgentPresenceSnapshot,
  recordAgentPresenceHeartbeat,
  recordAgentPresenceOffline,
} from '../services/assignment/agentPresence.service.js';
import {
  memberHasConcurrencyCapacity,
  syncActiveChatsFromDb,
} from '../services/assignment/agentWorkload.service.js';
import { previewAssignmentEligibility } from '../services/assignment/assignmentEligibility.service.js';
import {
  getOrgAssignmentSettingsForAdmin,
  putOrgAssignmentSettings,
} from '../services/assignment/assignmentOrgSettings.service.js';
import { getLatestAssignmentLogForConversation } from '../services/assignment/assignmentLog.service.js';
import { getAssignmentMetrics } from '../services/assignment/assignmentMetrics.service.js';
function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
  return id;
}

function memberIdOrThrow(req) {
  const memberId = req.params.memberId;
  if (!memberId || typeof memberId !== 'string') {
    throw new HttpError(400, 'memberId is required.');
  }
  return memberId.trim();
}

function actorMemberIdOrThrow(req) {
  const id = req.orgMembership?.id;
  if (!id) throw new HttpError(403, 'Active organization membership required.');
  return id;
}

export async function getAssignmentMetricsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const days = Number(req.query?.days);
    const metrics = await getAssignmentMetrics(organizationId, {
      days: Number.isFinite(days) ? days : undefined,
    });
    res.json(metrics);
  } catch (e) {
    next(e);
  }
}

export async function getOrgAssignmentSettingsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const settings = await getOrgAssignmentSettingsForAdmin(organizationId);
    res.json({ assignment: settings });
  } catch (e) {
    next(e);
  }
}

export async function putOrgAssignmentSettingsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const settings = await putOrgAssignmentSettings(organizationId, req.body ?? {});
    res.json({ assignment: settings });
  } catch (e) {
    next(e);
  }
}

function conversationIdFromParams(req) {
  const id =
    typeof req.params.conversationId === 'string'
      ? req.params.conversationId.trim()
      : '';
  if (!id) throw new HttpError(400, 'conversationId is required.');
  return id;
}

export async function getConversationAssignmentAuditController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const conversationId = conversationIdFromParams(req);
    const log = await getLatestAssignmentLogForConversation(organizationId, conversationId);
    res.json({ log });
  } catch (e) {
    next(e);
  }
}

export async function postPresenceHeartbeatController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const memberId = actorMemberIdOrThrow(req);
    const body = req.body ?? {};
    let presence = 'online';
    if (Object.prototype.hasOwnProperty.call(body, 'presence')) {
      const p = typeof body.presence === 'string' ? body.presence.trim() : body.presence;
      if (!isAgentPresenceHeartbeatState(p)) {
        throw new HttpError(
          400,
          `presence must be one of: ${AGENT_PRESENCE_HEARTBEAT_STATES.join(', ')}.`,
        );
      }
      presence = p;
    }

    const result = await recordAgentPresenceHeartbeat(organizationId, memberId, presence);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function postPresenceOfflineController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const memberId = actorMemberIdOrThrow(req);
    await recordAgentPresenceOffline(organizationId, memberId);
    res.json({ ok: true, presence: 'offline' });
  } catch (e) {
    next(e);
  }
}

export async function getOrgPresenceSnapshotController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const snapshot = await listOrgAgentPresenceSnapshot(organizationId);
    res.json(snapshot);
  } catch (e) {
    next(e);
  }
}

export async function getAgentWorkloadController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const memberId = memberIdOrThrow(req);
    const role = req.orgMembership?.role?.toUpperCase() ?? '';
    const selfId = req.orgMembership?.id;
    if (role !== 'ADMIN' && selfId !== memberId) {
      throw new HttpError(403, 'Insufficient permissions for this member workload.');
    }

    const [activeChats, capacity, config] = await Promise.all([
      syncActiveChatsFromDb(organizationId, memberId),
      memberHasConcurrencyCapacity(organizationId, memberId),
      getAgentAssignmentConfig(organizationId, memberId),
    ]);

    const profile = config.profile;
    res.json({
      memberId,
      activeChats,
      maxConcurrency: profile.maxConcurrency,
      withinShift: isWithinAgentShift({
        shiftStart: profile.shiftStart,
        shiftEnd: profile.shiftEnd,
        timezone: profile.timezone,
      }),
      capacity,
      presence: config.presence,
    });
  } catch (e) {
    next(e);
  }
}

export async function postAssignmentPreviewController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const body = req.body ?? {};
    const conversationId =
      typeof body.conversationId === 'string'
        ? body.conversationId.trim()
        : typeof body.conversation_id === 'string'
          ? body.conversation_id.trim()
          : '';
    if (!conversationId) {
      throw new HttpError(400, 'conversationId is required.');
    }
    const overrideInboxId =
      typeof body.targetInboxId === 'string'
        ? body.targetInboxId.trim()
        : typeof body.target_inbox_id === 'string'
          ? body.target_inbox_id.trim()
          : null;

    const result = await previewAssignmentEligibility({
      organizationId,
      conversationId,
      overrideInboxId: overrideInboxId || null,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getAgentPresenceController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const memberId = memberIdOrThrow(req);
    const role = req.orgMembership?.role?.toUpperCase() ?? '';
    const selfId = req.orgMembership?.id;
    if (role !== 'ADMIN' && selfId !== memberId) {
      throw new HttpError(403, 'Insufficient permissions for this member presence.');
    }
    const presence = await getAgentPresenceForMember(organizationId, memberId);
    res.json(presence);
  } catch (e) {
    next(e);
  }
}
