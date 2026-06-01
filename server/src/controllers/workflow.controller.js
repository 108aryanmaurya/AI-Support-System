import { isWorkflowTrigger } from '@ai-support/shared';
import { HttpError } from '../utils/httpError.js';
import {
  dryRunWorkflowForConversation,
  getOrgWorkflowRules,
  saveOrgWorkflowRules,
} from '../services/ai/workflowRules.service.js';
import { getWorkflowMetrics } from '../services/ai/workflowMetrics.service.js';
import { sendWorkflowTestNotification } from '../services/ai/workflowTestNotify.service.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
  return id;
}

export async function getWorkflowRulesController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const payload = await getOrgWorkflowRules(organizationId);
    const role = req.orgMembership?.role?.toUpperCase() ?? '';
    res.json({
      ...payload,
      meta: { canEdit: true },
    });
  } catch (e) {
    next(e);
  }
}

export async function putWorkflowRulesController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const rules = req.body?.rules;
    if (!Array.isArray(rules)) {
      throw new HttpError(400, 'rules must be an array.');
    }
    const schedule = req.body?.schedule;
    const saved = await saveOrgWorkflowRules(organizationId, rules, schedule);
    res.json({ ...saved, meta: { canEdit: true } });
  } catch (e) {
    next(e);
  }
}

export async function getWorkflowMetricsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const days = Number(req.query?.days);
    const metrics = await getWorkflowMetrics(organizationId, {
      days: Number.isFinite(days) ? days : undefined,
    });
    res.json(metrics);
  } catch (e) {
    next(e);
  }
}

export async function postWorkflowTestNotificationController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const userId = req.userId ?? req.user?.id;
    if (!userId) throw new HttpError(401, 'Authentication required.');
    const result = await sendWorkflowTestNotification({ organizationId, actorUserId: userId });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function dryRunWorkflowController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const conversationId =
      typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
    const trigger =
      typeof req.body?.trigger === 'string' ? req.body.trigger.trim() : 'inbound_message';

    if (!UUID_REGEX.test(conversationId)) {
      throw new HttpError(400, 'conversationId must be a UUID.');
    }
    if (!isWorkflowTrigger(trigger)) {
      throw new HttpError(400, `trigger must be one of: inbound_message, sla_warning, tag_added, schedule`);
    }

    const tagId =
      typeof req.body?.tagId === 'string' && UUID_REGEX.test(req.body.tagId.trim())
        ? req.body.tagId.trim()
        : undefined;

    const isBusinessHours =
      typeof req.body?.isBusinessHours === 'boolean' ? req.body.isBusinessHours : true;

    const result = await dryRunWorkflowForConversation({
      organizationId,
      conversationId,
      trigger,
      tagId,
      isBusinessHours,
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
}
