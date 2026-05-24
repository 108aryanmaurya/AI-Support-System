import {
  computeCustomerHistoryFactor,
  computeLowWorkloadFactor,
  computePriorityBonusFactor,
  computeRecentActivityFactor,
  computeSlaPerformanceFactor,
  computeStrategyScore,
  computeWeightedHybridScore,
  normalizeAssignmentStrategy,
  skillTierToFactor,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import {
  advanceRoundRobinCursor,
  orderMembersRoundRobin,
  pickRoundRobinWinner,
} from './assignmentRoundRobin.service.js';

const SLA_LOOKBACK_DAYS = 30;

/**
 * @param {string} organizationId
 * @param {string[]} memberIds
 */
export async function loadSlaPerformanceFactors(organizationId, memberIds) {
  const map = new Map(memberIds.map((id) => [id, 1]));
  if (memberIds.length === 0) return map;

  const since = new Date(Date.now() - SLA_LOOKBACK_DAYS * 86400000).toISOString();

  const { data: logs, error: logErr } = await supabaseAdmin
    .from('assignment_logs')
    .select('assigned_to, conversation_id')
    .eq('organization_id', organizationId)
    .in('assigned_to', memberIds)
    .gte('created_at', since)
    .not('assigned_to', 'is', null);

  if (logErr || !logs?.length) return map;

  const convIds = [...new Set(logs.map((l) => l.conversation_id).filter(Boolean))];
  if (convIds.length === 0) return map;

  let breachIds = new Set();
  try {
    const { data: breaches } = await supabaseAdmin
      .from('support_events')
      .select('entity_id')
      .eq('organization_id', organizationId)
      .eq('event_type', 'sla.first_response_breach')
      .in('entity_id', convIds)
      .gte('created_at', since)
      .limit(2000);

    breachIds = new Set((breaches ?? []).map((b) => b.entity_id));
  } catch {
    return map;
  }

  const stats = new Map(memberIds.map((id) => [id, { assigned: 0, breaches: 0 }]));
  for (const row of logs) {
    const mid = row.assigned_to;
    if (!stats.has(mid)) continue;
    const s = stats.get(mid);
    s.assigned += 1;
    if (breachIds.has(row.conversation_id)) {
      s.breaches += 1;
    }
  }

  for (const [id, s] of stats) {
    const rate = s.assigned > 0 ? s.breaches / s.assigned : 0;
    map.set(id, computeSlaPerformanceFactor(rate));
  }

  return map;
}

/**
 * @param {string} organizationId
 * @param {string} customerId
 * @param {string} excludeConversationId
 */
export async function loadPreviousAgentForCustomer(
  organizationId,
  customerId,
  excludeConversationId,
) {
  if (!customerId) return null;

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('assigned_to_member_id')
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId)
    .neq('id', excludeConversationId)
    .not('assigned_to_member_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error || !data?.length) return null;
  return data[0].assigned_to_member_id ?? null;
}

/**
 * Score and rank eligible agents.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.inboxId
 * @param {string} params.strategy
 * @param {string | null} [params.priority]
 * @param {string | null} [params.previousAgentId]
 * @param {object[]} params.eligibleRows
 */
export async function rankEligibleAgents({
  organizationId,
  inboxId,
  strategy: strategyRaw,
  priority = null,
  previousAgentId = null,
  eligibleRows,
}) {
  const strategy = normalizeAssignmentStrategy(strategyRaw);
  const memberIds = eligibleRows.map((r) => r.memberId);

  const slaFactors = await loadSlaPerformanceFactors(organizationId, memberIds);

  /** @type {object[]} */
  const scored = [];

  for (const row of eligibleRows) {
    const isSticky = Boolean(previousAgentId && row.memberId === previousAgentId);
    const factors = {
      skill_match: skillTierToFactor(row.skillMatchTier),
      low_workload: computeLowWorkloadFactor(row.activeChats ?? 0, row.maxConcurrency ?? 5),
      sla_performance: slaFactors.get(row.memberId) ?? 1,
      recent_activity: computeRecentActivityFactor(row.lastSeen ?? null),
      customer_history: computeCustomerHistoryFactor(isSticky),
      priority_bonus: computePriorityBonusFactor(priority),
    };

    const hybrid = computeWeightedHybridScore(factors);
    const finalScore = computeStrategyScore(strategy, row, factors);

    scored.push({
      memberId: row.memberId,
      strategy,
      skillMatchTier: row.skillMatchTier,
      factors,
      breakdown: hybrid.breakdown,
      finalScore,
      stickyMatch: isSticky,
      activeChats: row.activeChats,
      maxConcurrency: row.maxConcurrency,
    });
  }

  scored.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return String(a.memberId).localeCompare(String(b.memberId));
  });

  if (strategy === 'round_robin') {
    const ordered = await orderMembersRoundRobin(
      organizationId,
      inboxId,
      scored.map((s) => s.memberId),
    );
    const orderMap = new Map(ordered.map((id, i) => [id, i]));
    scored.sort((a, b) => (orderMap.get(a.memberId) ?? 0) - (orderMap.get(b.memberId) ?? 0));
    if (scored.length > 0) {
      scored[0].finalScore = 100;
    }
  }

  let recommendedMemberId = scored[0]?.memberId ?? null;

  if (scored.length > 1 && strategy !== 'round_robin') {
    const topScore = scored[0].finalScore;
    const tied = scored.filter((s) => s.finalScore === topScore).map((s) => s.memberId);
    if (tied.length > 1) {
      recommendedMemberId = await pickRoundRobinWinner(organizationId, inboxId, tied);
      const sortedEligible = scored.map((s) => s.memberId).sort();
      await advanceRoundRobinCursor(
        organizationId,
        inboxId,
        recommendedMemberId,
        sortedEligible,
      );
    }
  } else if (strategy === 'round_robin' && recommendedMemberId) {
    const sortedEligible = scored.map((s) => s.memberId).sort();
    await advanceRoundRobinCursor(
      organizationId,
      inboxId,
      recommendedMemberId,
      sortedEligible,
    );
  }

  return {
    strategy,
    rankedCandidates: scored,
    recommendedMemberId,
  };
}
