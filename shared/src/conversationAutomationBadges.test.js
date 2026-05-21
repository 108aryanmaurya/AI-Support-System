import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getConversationAutomationBadges } from './conversationAutomationBadges.js';

test('getConversationAutomationBadges returns ingress and intent labels', () => {
  const badges = getConversationAutomationBadges({
    ingress: { spam_suspected: true, sla_at_risk: true },
    ai: { intent: 'billing_issue' },
  });
  assert.equal(badges.length, 3);
  assert.deepEqual(
    badges.map((b) => b.id),
    ['spam_flagged', 'sla_risk', 'ai_intent'],
  );
  assert.equal(badges[2].label, 'billing issue');
});

test('getConversationAutomationBadges returns empty for missing metadata', () => {
  assert.deepEqual(getConversationAutomationBadges(null), []);
});
