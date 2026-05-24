import { isPresenceAssignable, isWithinAgentShift } from '@ai-support/shared';
import { computeSkillMatchTier, isSkillMatchEligible } from '@ai-support/shared';

/**
 * Pure eligibility checks (Sprint 3) — one code per failed dimension.
 *
 * @param {object} member — candidate row
 * @param {object} ctx — routing context
 * @returns {{ eligible: boolean, drops: Array<{ code: string, detail?: string }>, skillMatchTier: string }}
 */
export function evaluateMemberEligibility(member, ctx) {
  /** @type {Array<{ code: string, detail?: string }>} */
  const drops = [];

  if (member.membershipStatus !== 'ACTIVE') {
    drops.push({ code: 'member_not_active', detail: member.membershipStatus ?? 'unknown' });
  }

  const role = typeof member.role === 'string' ? member.role.toUpperCase() : '';
  if (role && role !== 'ADMIN' && role !== 'AGENT') {
    drops.push({ code: 'role_not_allowed', detail: role });
  }

  if (member.routingStatus === 'inactive') {
    drops.push({ code: 'agent_inactive' });
  }

  const presence = member.presence ?? 'offline';
  if (!isPresenceAssignable(presence)) {
    drops.push({ code: 'presence_not_assignable', detail: presence });
  }

  if (
    !isWithinAgentShift(
      {
        shiftStart: member.shiftStart,
        shiftEnd: member.shiftEnd,
        timezone: member.timezone,
      },
      ctx.now,
    )
  ) {
    drops.push({ code: 'outside_shift' });
  }

  if (ctx.inboxMemberIds && ctx.inboxMemberIds.length > 0) {
    if (!ctx.inboxMemberIds.includes(member.memberId)) {
      drops.push({ code: 'inbox_not_member', detail: ctx.targetInboxId });
    }
  }

  const skillMatchTier = computeSkillMatchTier(member.skills ?? [], {
    intent: ctx.intent,
    language: ctx.language,
    tagNames: ctx.tagNames,
  });

  if (!isSkillMatchEligible(skillMatchTier)) {
    drops.push({ code: 'no_skill_match', detail: skillMatchTier });
  }

  if (member.activeChats != null && member.maxConcurrency != null) {
    if (member.activeChats >= member.maxConcurrency) {
      drops.push({
        code: 'at_concurrency_limit',
        detail: `${member.activeChats}/${member.maxConcurrency}`,
      });
    }
  }

  return {
    eligible: drops.length === 0,
    drops,
    skillMatchTier,
  };
}
