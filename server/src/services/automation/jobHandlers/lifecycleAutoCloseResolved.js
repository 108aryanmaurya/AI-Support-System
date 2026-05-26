import { supabaseAdmin } from '../../../config/supabase.js';
import { createMessage } from '../../support.service.js';
import { updateConversationFromAutomation } from '../../conversationUpdate.service.js';
import { getOrgLifecycleSettings } from '../../lifecycle/lifecycleSettings.service.js';
import { logLifecycleStructured } from '../../lifecycle/lifecycleStructuredLog.service.js';
import { isResolvedIdleCandidate, resolvedIdleCutoffIso } from '../../lifecycle/lifecycleIdleResolved.js';
/**
 * Close one idle `resolved` conversation (`closed_reason: auto_idle_resolved`).
 */
export async function handleLifecycleAutoCloseResolved(job) {
  const organizationId = job.organization_id;
  const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
  const conversationId =
    typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';

  if (!conversationId) {
    throw new Error('lifecycle.auto_close_resolved payload requires conversationId');
  }

  const lifecycle = await getOrgLifecycleSettings(organizationId);
  if (!lifecycle.enabled) {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.auto_close_resolved',
      outcome: 'skipped',
      reason: 'lifecycle_disabled',
    });
    return;
  }

  const cutoff =
    typeof payload.idleCutoff === 'string' && payload.idleCutoff
      ? payload.idleCutoff
      : resolvedIdleCutoffIso(lifecycle.resolved_auto_close_days);

  const { data: prior, error: loadErr } = await supabaseAdmin
    .from('conversations')
    .select('id, status, last_message_at, channel_type')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (loadErr) {
    throw new Error(loadErr.message || 'Failed to load conversation for auto-close');
  }
  if (!prior) {
    logLifecycleStructured('warn', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.auto_close_resolved',
      outcome: 'skipped',
      reason: 'conversation_not_found',
    });
    return;
  }

  if (prior.status === 'closed') {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.auto_close_resolved',
      outcome: 'skipped',
      reason: 'already_closed',
    });
    return;
  }

  if (!isResolvedIdleCandidate(prior, cutoff)) {
    logLifecycleStructured('info', {
      organization_id: organizationId,
      conversation_id: conversationId,
      op: 'lifecycle.auto_close_resolved',
      outcome: 'skipped',
      reason: 'not_idle_or_not_resolved',
      status: prior.status,
      last_message_at: prior.last_message_at,
      idle_cutoff: cutoff,
    });
    return;
  }

  const startedAt = Date.now();

  await updateConversationFromAutomation({
    organizationId,
    conversationId,
    status: 'closed',
    closedReason: 'auto_idle_resolved',
    workflowMeta: {
      lifecycle: {
        auto_close: true,
        resolved_auto_close_days: lifecycle.resolved_auto_close_days,
        idle_cutoff: cutoff,
      },
    },
  });

  await createMessage({
    organizationId,
    conversationId,
    senderType: 'system',
    senderUserId: null,
    senderMemberId: null,
    content: `Conversation closed automatically after ${lifecycle.resolved_auto_close_days} days with no activity.`,
    metadata: {
      lifecycle: {
        event: 'auto_close_resolved',
        resolved_auto_close_days: lifecycle.resolved_auto_close_days,
      },
    },
  });

  logLifecycleStructured('info', {
    organization_id: organizationId,
    conversation_id: conversationId,
    op: 'lifecycle.auto_close_resolved',
    outcome: 'closed',
    closed_reason: 'auto_idle_resolved',
    duration_ms: Date.now() - startedAt,
  });
}
