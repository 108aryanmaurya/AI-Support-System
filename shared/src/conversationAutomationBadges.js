/**
 * Inbox list badges for Phase 4 automation metadata (aligned with Reports / support_events naming).
 *
 * @param {unknown} metadata — conversations.metadata
 * @returns {Array<{ id: string, label: string, tone: 'warning' | 'info' | 'neutral' }>}
 */
export function getConversationAutomationBadges(metadata) {
  const badges = [];
  if (!metadata || typeof metadata !== 'object') return badges;

  const ingress = /** @type {Record<string, unknown>} */ (metadata).ingress;
  const ai = /** @type {Record<string, unknown>} */ (metadata).ai;

  if (ingress && typeof ingress === 'object') {
    if (ingress.spam_suspected === true) {
      badges.push({ id: 'spam_flagged', label: 'Spam flagged', tone: 'warning' });
    }
    if (ingress.sla_at_risk === true) {
      badges.push({ id: 'sla_risk', label: 'SLA risk', tone: 'warning' });
    }
  }

  if (ai && typeof ai === 'object' && typeof ai.intent === 'string' && ai.intent.trim()) {
    const label = ai.intent.replace(/_/g, ' ');
    badges.push({ id: 'ai_intent', label, tone: 'info' });
  }

  return badges;
}
