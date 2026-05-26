import { INGRESS_DUPLICATE_ACTIONS, INGRESS_SPAM_ACTIONS, ORG_AI_MODEL_TIERS } from '@ai-support/shared';
import { HttpError } from '../utils/httpError.js';
import {
  getOrgAiAndAutomationSettings,
  patchOrgSettings,
} from '../services/orgSettings.service.js';
import {
  getOrgLifecycleSettingsForAdmin,
  putOrgLifecycleSettings,
} from '../services/lifecycle/orgLifecycleSettings.service.js';

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
  return id;
}

function parseBool(v, field) {
  if (typeof v === 'boolean') return v;
  throw new HttpError(400, `${field} must be a boolean.`);
}

function buildAiPatch(body) {
  if (!body || typeof body !== 'object') return null;
  const aiBody = body.ai;
  if (!aiBody || typeof aiBody !== 'object') return null;

  /** @type {Record<string, unknown>} */
  const patch = {};
  const keys = [
    'ai_enabled',
    'assist_enabled',
    'auto_tag_enabled',
    'auto_route_to_ai',
    'workflow_automation_enabled',
    'autonomous_replies_enabled',
    'default_conversation_ai_enabled',
  ];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(aiBody, key)) {
      patch[key] = parseBool(aiBody[key], `ai.${key}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(aiBody, 'model_tier')) {
    const tier = typeof aiBody.model_tier === 'string' ? aiBody.model_tier.trim() : '';
    if (!ORG_AI_MODEL_TIERS.includes(tier)) {
      throw new HttpError(400, `ai.model_tier must be one of: ${ORG_AI_MODEL_TIERS.join(', ')}.`);
    }
    patch.model_tier = tier;
  }
  return Object.keys(patch).length ? patch : null;
}

function buildAutomationPatch(body) {
  if (!body || typeof body !== 'object') return null;
  const autoBody = body.automation;
  if (!autoBody || typeof autoBody !== 'object') return null;

  /** @type {Record<string, unknown>} */
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(autoBody, 'inbound_notify_enabled')) {
    patch.inbound_notify_enabled = parseBool(autoBody.inbound_notify_enabled, 'automation.inbound_notify_enabled');
  }
  if (Object.prototype.hasOwnProperty.call(autoBody, 'assignment_notify_enabled')) {
    patch.assignment_notify_enabled = parseBool(
      autoBody.assignment_notify_enabled,
      'automation.assignment_notify_enabled',
    );
  }
  if (Object.prototype.hasOwnProperty.call(autoBody, 'sla_enabled')) {
    patch.sla_enabled = parseBool(autoBody.sla_enabled, 'automation.sla_enabled');
  }
  if (Object.prototype.hasOwnProperty.call(autoBody, 'first_response_sla_minutes')) {
    const n = Number(autoBody.first_response_sla_minutes);
    if (!Number.isFinite(n) || n < 1 || n > 10080) {
      throw new HttpError(400, 'automation.first_response_sla_minutes must be between 1 and 10080.');
    }
    patch.first_response_sla_minutes = Math.round(n);
  }
  if (Object.prototype.hasOwnProperty.call(autoBody, 'next_response_sla_minutes')) {
    const n = Number(autoBody.next_response_sla_minutes);
    if (!Number.isFinite(n) || n < 1 || n > 10080) {
      throw new HttpError(400, 'automation.next_response_sla_minutes must be between 1 and 10080.');
    }
    patch.next_response_sla_minutes = Math.round(n);
  }
  return Object.keys(patch).length ? patch : null;
}

function buildIngressPatch(body) {
  if (!body || typeof body !== 'object') return null;
  const ingressBody = body.ingress;
  if (!ingressBody || typeof ingressBody !== 'object') return null;

  /** @type {Record<string, unknown>} */
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(ingressBody, 'spam_enabled')) {
    patch.spam_enabled = parseBool(ingressBody.spam_enabled, 'ingress.spam_enabled');
  }
  if (Object.prototype.hasOwnProperty.call(ingressBody, 'duplicate_enabled')) {
    patch.duplicate_enabled = parseBool(ingressBody.duplicate_enabled, 'ingress.duplicate_enabled');
  }
  if (Object.prototype.hasOwnProperty.call(ingressBody, 'spam_action')) {
    const action = typeof ingressBody.spam_action === 'string' ? ingressBody.spam_action.trim() : '';
    if (!INGRESS_SPAM_ACTIONS.includes(action)) {
      throw new HttpError(400, `ingress.spam_action must be one of: ${INGRESS_SPAM_ACTIONS.join(', ')}.`);
    }
    patch.spam_action = action;
  }
  if (Object.prototype.hasOwnProperty.call(ingressBody, 'duplicate_action')) {
    const action =
      typeof ingressBody.duplicate_action === 'string' ? ingressBody.duplicate_action.trim() : '';
    if (!INGRESS_DUPLICATE_ACTIONS.includes(action)) {
      throw new HttpError(
        400,
        `ingress.duplicate_action must be one of: ${INGRESS_DUPLICATE_ACTIONS.join(', ')}.`,
      );
    }
    patch.duplicate_action = action;
  }
  if (Object.prototype.hasOwnProperty.call(ingressBody, 'duplicate_window_minutes')) {
    const n = Number(ingressBody.duplicate_window_minutes);
    if (!Number.isFinite(n) || n < 1 || n > 1440) {
      throw new HttpError(400, 'ingress.duplicate_window_minutes must be between 1 and 1440.');
    }
    patch.duplicate_window_minutes = Math.round(n);
  }
  if (Object.prototype.hasOwnProperty.call(ingressBody, 'blocklist')) {
    if (!Array.isArray(ingressBody.blocklist)) {
      throw new HttpError(400, 'ingress.blocklist must be an array of strings.');
    }
    patch.blocklist = ingressBody.blocklist;
  }
  return Object.keys(patch).length ? patch : null;
}

export async function getOrgAiSettingsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const settings = await getOrgAiAndAutomationSettings(organizationId);
    const role = req.orgMembership?.role?.toUpperCase() ?? '';
    res.json({
      ...settings,
      meta: {
        canEdit: role === 'ADMIN',
        phases: {
          assist: 'Phase 3',
          autoTag: 'Phase 3–4',
          autoRoute: 'Phase 4',
          workflowAutomation: 'Phase 4',
          autonomous: 'Phase 6',
        },
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function getOrgLifecycleSettingsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const lifecycle = await getOrgLifecycleSettingsForAdmin(organizationId);
    const role = req.orgMembership?.role?.toUpperCase() ?? '';
    res.json({
      lifecycle,
      meta: { canEdit: role === 'ADMIN' },
    });
  } catch (e) {
    next(e);
  }
}

export async function patchOrgLifecycleSettingsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const body = req.body?.lifecycle ?? req.body;
    const saved = await putOrgLifecycleSettings(organizationId, body);
    res.json({
      ...saved,
      meta: { canEdit: true },
    });
  } catch (e) {
    next(e);
  }
}

export async function patchOrgAiSettingsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const aiPatch = buildAiPatch(req.body);
    const automationPatch = buildAutomationPatch(req.body);
    const ingressPatch = buildIngressPatch(req.body);

    if (!aiPatch && !automationPatch && !ingressPatch) {
      throw new HttpError(400, 'Provide ai, automation, and/or ingress fields to update.');
    }

    const saved = await patchOrgSettings(organizationId, {
      ...(aiPatch ? { ai: aiPatch } : {}),
      ...(automationPatch ? { automation: automationPatch } : {}),
      ...(ingressPatch ? { ingress: ingressPatch } : {}),
    });

    res.json({
      ...saved,
      meta: { canEdit: true },
    });
  } catch (e) {
    next(e);
  }
}
