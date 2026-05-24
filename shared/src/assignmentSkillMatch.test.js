import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeSkillMatchTier, isSkillMatchEligible } from './assignmentSkillMatch.js';

describe('computeSkillMatchTier', () => {
  it('returns generic when agent has no skills', () => {
    assert.equal(computeSkillMatchTier([], { intent: 'billing_issue' }), 'generic');
  });

  it('returns exact for intent match', () => {
    assert.equal(
      computeSkillMatchTier(['billing_issue'], { intent: 'billing_issue' }),
      'exact',
    );
  });

  it('returns related for alias skill', () => {
    assert.equal(
      computeSkillMatchTier(['billing'], { intent: 'refund_request' }),
      'related',
    );
  });

  it('returns none when no overlap', () => {
    assert.equal(
      computeSkillMatchTier(['legal'], { intent: 'technical_support', tagNames: ['vip'] }),
      'none',
    );
    assert.equal(isSkillMatchEligible('none'), false);
  });
});
