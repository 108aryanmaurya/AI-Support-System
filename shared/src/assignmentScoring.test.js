import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeLowWorkloadFactor,
  computeWeightedHybridScore,
  skillTierToFactor,
} from './assignmentScoring.js';

describe('assignmentScoring', () => {
  it('maps skill tiers to factors', () => {
    assert.equal(skillTierToFactor('exact'), 1);
    assert.equal(skillTierToFactor('related'), 0.625);
    assert.equal(skillTierToFactor('generic'), 0.25);
  });

  it('computes low workload', () => {
    assert.equal(computeLowWorkloadFactor(0, 5), 1);
    assert.equal(computeLowWorkloadFactor(5, 5), 0);
  });

  it('sums weighted hybrid to 100 at perfect factors', () => {
    const { finalScore } = computeWeightedHybridScore({
      skill_match: 1,
      low_workload: 1,
      sla_performance: 1,
      recent_activity: 1,
      customer_history: 1,
      priority_bonus: 1,
    });
    assert.equal(finalScore, 100);
  });
});
