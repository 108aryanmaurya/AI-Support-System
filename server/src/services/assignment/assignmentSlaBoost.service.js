import { isSlaRemainingUrgent } from '@ai-support/shared';
import { getOrgAutomationSettings } from '../automation/orgAutomationSettings.service.js';
import { supabaseAdmin } from '../../config/supabase.js';

/**
 * Remaining minutes until first-response SLA deadline (null if already met or unknown).
 *
 * @param {string} organizationId
 * @param {string} conversationId
 */
export async function getConversationRemainingSlaMinutes(organizationId, conversationId) {
  const settings = await getOrgAutomationSettings(organizationId);
  const slaMinutes = Number(settings.first_response_sla_minutes);
  if (!settings.sla_enabled || !Number.isFinite(slaMinutes) || slaMinutes <= 0) {
    return { slaMinutes: null, remainingMinutes: null, agentReplied: false };
  }

  const { data: messages, error } = await supabaseAdmin
    .from('messages')
    .select('sender_type, created_at')
    .eq('conversation_id', conversationId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) {
    return { slaMinutes, remainingMinutes: null, agentReplied: false };
  }

  const list = messages ?? [];
  const firstCustomer = list.find((m) => m.sender_type === 'customer');
  if (!firstCustomer) {
    return { slaMinutes, remainingMinutes: slaMinutes, agentReplied: false };
  }

  const firstCustomerAt = new Date(firstCustomer.created_at).getTime();
  const agentReply = list.find(
    (m) => m.sender_type === 'agent' && new Date(m.created_at).getTime() > firstCustomerAt,
  );
  if (agentReply) {
    return { slaMinutes, remainingMinutes: null, agentReplied: true };
  }

  const deadlineMs = firstCustomerAt + slaMinutes * 60 * 1000;
  const remainingMs = deadlineMs - Date.now();
  const remainingMinutes = remainingMs / 60000;

  return {
    slaMinutes,
    remainingMinutes,
    agentReplied: false,
    firstCustomerAt: firstCustomer.created_at,
  };
}

/**
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {object} routing — merged org assignment settings
 */
export async function resolveSlaRoutingContext(organizationId, conversationId, routing) {
  if (!routing?.sla_routing_enabled) {
    return { urgent: false, remainingMinutes: null, slaBoostApplied: false };
  }

  const sla = await getConversationRemainingSlaMinutes(organizationId, conversationId);
  const urgent = isSlaRemainingUrgent(
    sla.remainingMinutes,
    routing.sla_remaining_minutes_threshold,
  );

  return {
    urgent,
    remainingMinutes: sla.remainingMinutes,
    slaMinutes: sla.slaMinutes,
    agentReplied: sla.agentReplied,
    slaBoostApplied: false,
  };
}
