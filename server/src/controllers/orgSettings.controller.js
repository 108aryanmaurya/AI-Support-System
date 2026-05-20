import { ORG_AI_MODEL_TIERS } from '@ai-support/shared';
import { HttpError } from '../utils/httpError.js';
import {
  getOrgAiAndAutomationSettings,
  patchOrgSettings,
} from '../services/orgSettings.service.js';

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

export async function patchOrgAiSettingsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const aiPatch = buildAiPatch(req.body);
    const automationPatch = buildAutomationPatch(req.body);

    if (!aiPatch && !automationPatch) {
      throw new HttpError(400, 'Provide ai and/or automation fields to update.');
    }

    const saved = await patchOrgSettings(organizationId, {
      ...(aiPatch ? { ai: aiPatch } : {}),
      ...(automationPatch ? { automation: automationPatch } : {}),
    });

    res.json({
      ...saved,
      meta: { canEdit: true },
    });
  } catch (e) {
    next(e);
  }
}
