import { supabaseAdmin } from '../../config/supabase.js';

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
    ...(prior.ingress && typeof prior.ingress === 'object' ? prior.ingress : {}),
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
