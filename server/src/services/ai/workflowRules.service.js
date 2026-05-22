import { randomUUID } from 'node:crypto';
import {
  mergeOrgWorkflowSettings,
  mergeWorkflowSchedule,
  validateWorkflowRules,
  WORKFLOW_RULES_LIMITS,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import {
  buildWorkflowEvalContext,
  evaluateWorkflowRules,
} from './workflowEvaluate.service.js';
import { getConversationAiSignals } from './conversationAiSignals.service.js';
import { isWorkflowAutomationEnabled } from './workflowAiGates.service.js';
import { logWorkflowEvent } from './workflowLog.service.js';
import { applyMatchedWorkflowRules } from './workflowApply.service.js';
import { WorkflowFatalError } from './workflowErrors.js';
import { isWithinBusinessHours } from './businessHours.service.js';
import { markConversationSlaAtRisk } from './workflowConversationFlags.service.js';
import { emitSupportEvent } from '../analytics/supportEvents.service.js';

async function loadSettingsRow(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, settings')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load organization settings.');
  }
  if (!data) {
    throw new HttpError(404, 'Organization not found.');
  }
  return data;
}

/**
 * @param {string} organizationId
 */
export async function getOrgWorkflowRules(organizationId) {
  const row = await loadSettingsRow(organizationId);
  const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  const workflow = mergeOrgWorkflowSettings(settings.workflow);
  return {
    schema_version: workflow.schema_version,
    updated_at: workflow.updated_at,
    rules: workflow.rules,
    schedule: workflow.schedule,
    limits: WORKFLOW_RULES_LIMITS,
  };
}

/**
 * Replace all workflow rules (validated). Caller must enforce ADMIN.
 *
 * @param {string} organizationId
 * @param {unknown} rawRules
 */
export async function saveOrgWorkflowRules(organizationId, rawRules, rawSchedule = undefined) {
  let validated;
  try {
    validated = validateWorkflowRules(rawRules);
  } catch (e) {
    throw new HttpError(400, e?.message || 'Invalid workflow rules.');
  }

  const rules = validated.map((r) => ({
    ...r,
    id: r.id || randomUUID(),
  }));

  const row = await loadSettingsRow(organizationId);
  const prior = row.settings && typeof row.settings === 'object' ? { ...row.settings } : {};
  const priorWorkflow =
    prior.workflow && typeof prior.workflow === 'object' ? prior.workflow : {};

  const schedule =
    rawSchedule !== undefined
      ? mergeWorkflowSchedule(rawSchedule)
      : mergeOrgWorkflowSettings(priorWorkflow).schedule;

  const next = {
    ...prior,
    workflow: {
      schema_version: 1,
      updated_at: new Date().toISOString(),
      rules,
      schedule,
    },
  };

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ settings: next })
    .eq('id', organizationId);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to save workflow rules.');
  }

  logWorkflowEvent({
    organization_id: organizationId,
    event: 'rules_saved',
    rule_count: rules.length,
  });

  return getOrgWorkflowRules(organizationId);
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.trigger
 * @param {string} [params.tagId]
 * @param {boolean} [params.isBusinessHours]
 */
export async function dryRunWorkflowForConversation({
  organizationId,
  conversationId,
  trigger,
  tagId,
  isBusinessHours,
}) {
  const { rules, schedule } = await getOrgWorkflowRules(organizationId);
  const resolvedBusinessHours =
    typeof isBusinessHours === 'boolean'
      ? isBusinessHours
      : isWithinBusinessHours(schedule);
  const signals = await getConversationAiSignals(organizationId, conversationId);
  const ctx = buildWorkflowEvalContext({
    signals,
    trigger,
    tagId,
    isBusinessHours: resolvedBusinessHours,
  });
  const matched = evaluateWorkflowRules(rules, trigger, ctx);

  return { context: ctx, matched };
}

/**
 * Evaluate rules for a trigger (worker / inbound).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.trigger
 * @param {string} [params.messageId]
 * @param {string} [params.tagId]
 * @param {boolean} [params.applyActions]
 * @param {boolean} [params.isBusinessHours]
 * @param {number} [params.slaMinutes]
 */
export async function evaluateWorkflowForConversation({
  organizationId,
  conversationId,
  trigger,
  messageId,
  tagId,
  applyActions = false,
  isBusinessHours,
  slaMinutes,
}) {
  if (!(await isWorkflowAutomationEnabled(organizationId))) {
    return { skipped: true, reason: 'workflow_disabled', matched: [], apply: null };
  }
console.log('trigger', trigger)
  const { rules, schedule } = await getOrgWorkflowRules(organizationId);
  const hasTriggerRules = (rules ?? []).some(
    (r) => r.enabled !== false && r.trigger === trigger,
  );
  if (!hasTriggerRules) {
    return { skipped: true, reason: 'no_rules_for_trigger', matched: [], apply: null };
  }

  let signals;
  try {
    signals = await getConversationAiSignals(organizationId, conversationId);
  } catch (e) {
    if (e?.status === 404) {
      return { skipped: true, reason: 'conversation_not_found', matched: [], apply: null };
    }
    throw e;
  }

  const resolvedBusinessHours =
    typeof isBusinessHours === 'boolean'
      ? isBusinessHours
      : isWithinBusinessHours(schedule);

  const ctx = buildWorkflowEvalContext({
    signals,
    trigger,
    tagId,
    isBusinessHours: resolvedBusinessHours,
  });
  const matched = evaluateWorkflowRules(rules, trigger, ctx);

  for (const m of matched) {
    logWorkflowEvent({
      organization_id: organizationId,
      conversation_id: conversationId,
      message_id: messageId ?? null,
      rule_id: m.ruleId,
      event: 'rule_matched',
      action_types: m.actions.map((a) => a.type),
    });
  }

  if (matched.length === 0) {
    logWorkflowEvent({
      organization_id: organizationId,
      conversation_id: conversationId,
      message_id: messageId ?? null,
      event: 'no_match',
      trigger,
    });
    return { skipped: false, matched, context: ctx, apply: null };
  }

  let apply = null;
  if (applyActions) {
    console.log('applyActions', applyActions)
    if (trigger === 'sla_warning') {
      await markConversationSlaAtRisk({
        organizationId,
        conversationId,
        slaMinutes,
      });
    }
    apply = await applyMatchedWorkflowRules({
      organizationId,
      conversationId,
      messageId,
      matched,
    });
    if (trigger === 'sla_warning' && matched.length > 0) {
      emitSupportEvent({
        organizationId,
        eventType: 'workflow.sla_warning_applied',
        entityType: 'conversation',
        entityId: conversationId,
        channelType: signals.channel_id ?? null,
        payload: {
          rule_ids: matched.map((m) => m.ruleId),
          sla_minutes: slaMinutes ?? null,
        },
      });
    }
  }

  return { skipped: false, matched, context: ctx, apply };
}

/**
 * Worker entry: evaluate inbound_message rules and apply actions.
 */
export async function runInboundWorkflowAutomation({
  organizationId,
  conversationId,
  messageId,
}) {
  if (!organizationId || !conversationId || !messageId) {
    throw new WorkflowFatalError('runInboundWorkflowAutomation requires organizationId, conversationId, messageId');
  }

  return evaluateWorkflowForConversation({
    organizationId,
    conversationId,
    trigger: 'inbound_message',
    messageId,
    applyActions: true,
  });
}

/**
 * Worker entry: evaluate sla_warning rules and apply actions.
 */
export async function runSlaWarningWorkflowAutomation({
  organizationId,
  conversationId,
  slaMinutes,
}) {
  if (!organizationId || !conversationId) {
    throw new WorkflowFatalError(
      'runSlaWarningWorkflowAutomation requires organizationId and conversationId',
    );
  }

  return evaluateWorkflowForConversation({
    organizationId,
    conversationId,
    trigger: 'sla_warning',
    applyActions: true,
    slaMinutes,
  });
}

/**
 * Run schedule-triggered rules for one conversation.
 */
export async function runScheduleWorkflowForConversation({
  organizationId,
  conversationId,
  isBusinessHours,
}) {
  return evaluateWorkflowForConversation({
    organizationId,
    conversationId,
    trigger: 'schedule',
    applyActions: true,
    isBusinessHours,
  });
}

/**
 * Worker entry: evaluate tag_added rules when a tag is attached.
 */
export async function runTagAddedWorkflowAutomation({
  organizationId,
  conversationId,
  tagId,
}) {
  if (!organizationId || !conversationId || !tagId) {
    throw new WorkflowFatalError(
      'runTagAddedWorkflowAutomation requires organizationId, conversationId, and tagId',
    );
  }

  const result = await evaluateWorkflowForConversation({
    organizationId,
    conversationId,
    trigger: 'tag_added',
    tagId,
    applyActions: true,
  });

  if (result.matched?.length) {
    emitSupportEvent({
      organizationId,
      eventType: 'workflow.tag_added_applied',
      entityType: 'conversation',
      entityId: conversationId,
      payload: {
        tag_id: tagId,
        rule_ids: result.matched.map((m) => m.ruleId),
      },
    });
  }

  return result;
}
