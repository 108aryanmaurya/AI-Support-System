/**
 * SLA-urgent ranking override (Sprint 6+).
 * When remaining first-response SLA is low, prefer fastest-available agents (lowest active chats).
 */

/**
 * Re-order ranked candidates for SLA urgency: lowest active chats first, then score.
 *
 * @param {object[]} rankedCandidates
 * @param {Map<string, number>} activeChatsByMember
 */
export function applySlaUrgentRanking(rankedCandidates, activeChatsByMember) {
  if (!Array.isArray(rankedCandidates) || rankedCandidates.length === 0) {
    return {
      rankedCandidates: [],
      recommendedMemberId: null,
      slaBoostApplied: false,
    };
  }

  const sorted = [...rankedCandidates].sort((a, b) => {
    const acA = activeChatsByMember.get(a.memberId) ?? 0;
    const acB = activeChatsByMember.get(b.memberId) ?? 0;
    if (acA !== acB) return acA - acB;
    return (b.finalScore ?? 0) - (a.finalScore ?? 0);
  });

  return {
    rankedCandidates: sorted,
    recommendedMemberId: sorted[0]?.memberId ?? null,
    slaBoostApplied: true,
  };
}

/**
 * @param {number | null} remainingMinutes
 * @param {number} thresholdMinutes
 */
export function isSlaRemainingUrgent(remainingMinutes, thresholdMinutes) {
  if (!Number.isFinite(remainingMinutes)) return false;
  const threshold = Number(thresholdMinutes);
  if (!Number.isFinite(threshold) || threshold <= 0) return false;
  return remainingMinutes >= 0 && remainingMinutes < threshold;
}
