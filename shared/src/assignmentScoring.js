/**
 * Weighted hybrid scoring constants (Sprint 4+).
 * Factors are 0–1 unless noted; weighted sum capped at 100.
 */

import { isAssignmentStrategy } from './assignment.js';

/** Max points per dimension in weighted_hybrid. */
export const ASSIGNMENT_SCORE_WEIGHTS = Object.freeze({
  skill_match: 40,
  low_workload: 20,
  sla_performance: 15,
  recent_activity: 10,
  customer_history: 10,
  priority_bonus: 5,
});

/** Skill tier → skill_match factor (0–1) before × 40. */
export const SKILL_TIER_FACTORS = Object.freeze({
  exact: 1,
  related: 25 / 40,
  generic: 10 / 40,
  none: 0,
});

/**
 * @param {string} tier
 * @returns {number}
 */
export function skillTierToFactor(tier) {
  const key = typeof tier === 'string' ? tier : 'none';
  return SKILL_TIER_FACTORS[key] ?? 0;
}

/**
 * @param {number} activeChats
 * @param {number} maxConcurrency
 * @returns {number} 0–1
 */
export function computeLowWorkloadFactor(activeChats, maxConcurrency) {
  const max = Math.max(1, Number(maxConcurrency) || 1);
  const chats = Math.max(0, Number(activeChats) || 0);
  return Math.max(0, Math.min(1, 1 - chats / max));
}

/**
 * @param {number} breachRate — 0–1 assigned conversations with SLA breach
 * @returns {number} 0–1
 */
export function computeSlaPerformanceFactor(breachRate) {
  const r = Math.max(0, Math.min(1, Number(breachRate) || 0));
  return Math.max(0, Math.min(1, 1 - r));
}

/**
 * @param {string | null} lastSeenIso
 * @param {Date} [now]
 * @returns {number} 0–1
 */
export function computeRecentActivityFactor(lastSeenIso, now = new Date()) {
  if (!lastSeenIso) return 0.35;
  const t = new Date(lastSeenIso).getTime();
  if (!Number.isFinite(t)) return 0.35;
  const ageMs = now.getTime() - t;
  if (ageMs <= 5 * 60 * 1000) return 1;
  if (ageMs <= 30 * 60 * 1000) return 0.75;
  if (ageMs <= 2 * 60 * 60 * 1000) return 0.5;
  return 0.25;
}

/**
 * @param {boolean} isStickyMatch
 * @returns {number} 0–1 (full 10 pts when 1)
 */
export function computeCustomerHistoryFactor(isStickyMatch) {
  return isStickyMatch ? 1 : 0;
}

/**
 * @param {string | null} priority
 * @returns {number} 0–1
 */
export function computePriorityBonusFactor(priority) {
  const p = typeof priority === 'string' ? priority.toLowerCase() : '';
  if (p === 'urgent') return 1;
  if (p === 'high') return 0.7;
  return 0.2;
}

/**
 * @param {object} factors — each 0–1
 * @returns {{ breakdown: Record<string, number>, finalScore: number }}
 */
export function computeWeightedHybridScore(factors) {
  const breakdown = {
    skill_match: round2((factors.skill_match ?? 0) * ASSIGNMENT_SCORE_WEIGHTS.skill_match),
    low_workload: round2((factors.low_workload ?? 0) * ASSIGNMENT_SCORE_WEIGHTS.low_workload),
    sla_performance: round2(
      (factors.sla_performance ?? 0) * ASSIGNMENT_SCORE_WEIGHTS.sla_performance,
    ),
    recent_activity: round2(
      (factors.recent_activity ?? 0) * ASSIGNMENT_SCORE_WEIGHTS.recent_activity,
    ),
    customer_history: round2(
      (factors.customer_history ?? 0) * ASSIGNMENT_SCORE_WEIGHTS.customer_history,
    ),
    priority_bonus: round2((factors.priority_bonus ?? 0) * ASSIGNMENT_SCORE_WEIGHTS.priority_bonus),
  };

  const finalScore = round2(
    Object.values(breakdown).reduce((sum, v) => sum + v, 0),
  );

  return { breakdown, finalScore };
}

/**
 * @param {string} strategy
 * @param {object} row
 * @param {string} row.skillMatchTier
 * @param {number} row.activeChats
 * @param {number} row.maxConcurrency
 * @param {object} factors
 * @returns {number}
 */
export function computeStrategyScore(strategy, row, factors) {
  if (strategy === 'least_loaded') {
    const chats = row.activeChats ?? 0;
    return round2(100 - chats * 10);
  }
  if (strategy === 'skill_based') {
    return round2(skillTierToFactor(row.skillMatchTier) * 100);
  }
  if (strategy === 'round_robin') {
    return 0;
  }
  return computeWeightedHybridScore(factors).finalScore;
}

/**
 * @param {unknown} strategy
 * @returns {string}
 */
export function normalizeAssignmentStrategy(strategy) {
  if (isAssignmentStrategy(strategy)) return strategy;
  return 'weighted_hybrid';
}

/**
 * @param {number} n
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}
