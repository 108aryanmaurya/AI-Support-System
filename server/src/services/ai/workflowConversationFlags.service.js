import { isConversationPriority } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { updateConversationFromAutomation } from '../conversationUpdate.service.js';

/**
 * @param {unknown} metadata
 */
function ingressFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  const ingress = /** @type {Record<string, unknown>} */ (metadata).ingress;
  return ingress && typeof ingress === 'object' ? { ...ingress } : {};
}

/**
 * Mark conversation for operator visibility (Sprint 4 SLA path).
 */
export async function markConversationSlaAtRisk({
  organizationId,
  conversationId,
  slaMinutes,
}) {
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!conv) return;

  const prior = conv.metadata && typeof conv.metadata === 'object' ? { ...conv.metadata } : {};
  prior.ingress = {
    ...ingressFromMetadata(prior),
    sla_at_risk: true,
    sla_minutes: slaMinutes ?? null,
    sla_flagged_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from('conversations')
    .update({ metadata: prior })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);
}

/**
 * Remember priority applied by an `sla_warning` workflow `set_priority` action.
 *
 * @param {object} p
 * @param {string} p.organizationId
 * @param {string} p.conversationId
 * @param {string} p.priority
 */
export async function recordSlaWorkflowPriority({ organizationId, conversationId, priority }) {
  if (!isConversationPriority(priority)) return;

  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!conv) return;

  const prior = conv.metadata && typeof conv.metadata === 'object' ? { ...conv.metadata } : {};
  prior.ingress = {
    ...ingressFromMetadata(prior),
    sla_workflow_priority: priority,
  };

  await supabaseAdmin
    .from('conversations')
    .update({ metadata: prior })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);
}

/**
 * Whether to reset `conversations.priority` to medium when clearing SLA risk.
 *
 * @param {string | null | undefined} currentPriority
 * @param {string | null | undefined} slaWorkflowPriority — from metadata.ingress
 */
export function shouldResetPriorityAfterSlaCleared(currentPriority, slaWorkflowPriority) {
  const current = currentPriority ?? 'medium';
  if (current === 'medium') return false;

  if (slaWorkflowPriority && isConversationPriority(slaWorkflowPriority)) {
    return current === slaWorkflowPriority;
  }

  return current === 'urgent' || current === 'high';
}

/**
 * Clear SLA risk badge after a human agent first response (matches breach detection: sender_type agent).
 * Resets priority to medium when it still matches the SLA workflow bump (or legacy urgent/high only).
 *
 * @param {object} p
 * @param {string} p.organizationId
 * @param {string} p.conversationId
 * @returns {Promise<boolean>} true when SLA risk flag was cleared
 */
export async function clearConversationSlaAtRisk({ organizationId, conversationId }) {
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('metadata, priority')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!conv) return false;

  const ingress = ingressFromMetadata(conv.metadata);
  if (ingress.sla_at_risk !== true) return false;

  const slaWorkflowPriority =
    typeof ingress.sla_workflow_priority === 'string' ? ingress.sla_workflow_priority : null;

  const resetPriority = shouldResetPriorityAfterSlaCleared(conv.priority, slaWorkflowPriority);

  const prior = conv.metadata && typeof conv.metadata === 'object' ? { ...conv.metadata } : {};
  const { sla_workflow_priority: _removed, ...ingressRest } = ingress;
  prior.ingress = {
    ...ingressRest,
    sla_at_risk: false,
    sla_cleared_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ metadata: prior })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[sla-at-risk] clear failed', {
      organizationId,
      conversationId,
      message: error.message,
    });
    return false;
  }

  if (resetPriority) {
    await updateConversationFromAutomation({
      organizationId,
      conversationId,
      priority: 'medium',
      workflowMeta: { source: 'sla_cleared' },
    });
  }

  return true;
}
