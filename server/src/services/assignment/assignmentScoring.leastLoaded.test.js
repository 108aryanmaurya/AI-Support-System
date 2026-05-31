import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeStrategyScore } from '@ai-support/shared';

describe('least_loaded (balanced inbox) scoring', () => {
  it('ranks lower activeChats higher', () => {
    const factors = {};
    const busy = computeStrategyScore('least_loaded', { activeChats: 5, skillMatchTier: 'none' }, factors);
    const light = computeStrategyScore('least_loaded', { activeChats: 1, skillMatchTier: 'none' }, factors);
    assert.ok(light > busy);
  });
});
