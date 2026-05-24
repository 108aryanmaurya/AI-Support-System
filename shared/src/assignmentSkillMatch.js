/**
 * Skill match tiers for eligibility (Sprint 3+). Sprint 4 scoring uses same tiers.
 */

export const SKILL_MATCH_TIERS = Object.freeze(['exact', 'related', 'generic', 'none']);

/** Drop reason when skills configured but no match. */
export const ELIGIBILITY_DROP_CODES = Object.freeze([
  'member_not_active',
  'agent_inactive',
  'presence_not_assignable',
  'outside_shift',
  'inbox_not_member',
  'no_skill_match',
  'at_concurrency_limit',
  'role_not_allowed',
]);

/**
 * Related intent families for partial skill match.
 * @type {Record<string, string[]>}
 */
const INTENT_SKILL_ALIASES = Object.freeze({
  billing_issue: ['billing', 'refund', 'payment', 'invoice'],
  refund_request: ['billing', 'refund', 'payment'],
  technical_support: ['technical', 'tech', 'engineering', 'product'],
  account_access: ['account', 'login', 'access', 'security'],
  shipping_delivery: ['shipping', 'delivery', 'logistics'],
  product_question: ['product', 'sales'],
  complaint: ['support', 'escalation'],
  feedback: ['support', 'product'],
  general_inquiry: ['support', 'general'],
  other: ['support', 'general'],
});

/**
 * @param {string[]} agentSkills — normalized lowercase
 * @param {object} ctx
 * @param {string | null} [ctx.intent]
 * @param {string | null} [ctx.language]
 * @param {string[]} [ctx.tagNames] — lowercase
 */
export function computeSkillMatchTier(agentSkills, ctx) {
  const skills = agentSkills ?? [];
  const intent = ctx.intent ? String(ctx.intent).trim().toLowerCase() : null;
  const language = ctx.language ? String(ctx.language).trim().toLowerCase() : null;
  const tagNames = (ctx.tagNames ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean);

  if (skills.length === 0) {
    return 'generic';
  }

  if (intent && skills.includes(intent)) {
    return 'exact';
  }

  if (language && skills.includes(language)) {
    return 'related';
  }

  for (const tag of tagNames) {
    if (skills.includes(tag)) return 'related';
  }

  if (intent && INTENT_SKILL_ALIASES[intent]) {
    const aliases = INTENT_SKILL_ALIASES[intent];
    if (aliases.some((a) => skills.includes(a))) {
      return 'related';
    }
  }

  if (skills.includes('support') || skills.includes('general')) {
    return 'generic';
  }

  return 'none';
}

/**
 * @param {string} tier
 * @returns {boolean}
 */
export function isSkillMatchEligible(tier) {
  return tier === 'exact' || tier === 'related' || tier === 'generic';
}
