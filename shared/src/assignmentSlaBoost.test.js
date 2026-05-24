import test from 'node:test';
import assert from 'node:assert/strict';
import { applySlaUrgentRanking, isSlaRemainingUrgent } from './assignmentSlaBoost.js';

test('isSlaRemainingUrgent when below threshold', () => {
  assert.equal(isSlaRemainingUrgent(4, 5), true);
  assert.equal(isSlaRemainingUrgent(5, 5), false);
  assert.equal(isSlaRemainingUrgent(-1, 5), false);
});

test('applySlaUrgentRanking prefers lowest active chats', () => {
  const ranked = [
    { memberId: 'a', finalScore: 90 },
    { memberId: 'b', finalScore: 70 },
    { memberId: 'c', finalScore: 80 },
  ];
  const active = new Map([
    ['a', 5],
    ['b', 1],
    ['c', 3],
  ]);
  const out = applySlaUrgentRanking(ranked, active);
  assert.equal(out.slaBoostApplied, true);
  assert.equal(out.recommendedMemberId, 'b');
  assert.deepEqual(out.rankedCandidates.map((r) => r.memberId), ['b', 'c', 'a']);
});
