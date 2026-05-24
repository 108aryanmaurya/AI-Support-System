import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateMemberEligibility } from './assignmentEligibility.filters.js';

/**
 * Sprint 8: concurrent auto-route must not pick agents at concurrency ceiling.
 */
describe('assignment concurrency under load', () => {
  const ctx = {
    now: new Date('2026-06-01T12:00:00Z'),
    targetInboxId: 'default',
    inboxMemberIds: null,
    intent: 'billing',
    language: 'en',
    tagNames: [],
    priority: 'medium',
  };

  const baseMember = {
    memberId: 'm1',
    role: 'AGENT',
    membershipStatus: 'ACTIVE',
    routingStatus: 'active',
    maxConcurrency: 2,
    shiftStart: null,
    shiftEnd: null,
    timezone: 'UTC',
    skills: ['billing'],
    presence: 'online',
    activeChats: 2,
  };

  it('drops agents at max concurrency so concurrent assign cannot over-fill', () => {
    const agents = [
      { ...baseMember, memberId: 'a', activeChats: 2, maxConcurrency: 2 },
      { ...baseMember, memberId: 'b', activeChats: 2, maxConcurrency: 2 },
      { ...baseMember, memberId: 'c', activeChats: 1, maxConcurrency: 2 },
    ];

    const eligible = agents.filter((m) => evaluateMemberEligibility(m, ctx).eligible);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].memberId, 'c');
  });

  it('returns no eligible agents when entire pool is saturated', () => {
    const agents = [
      { ...baseMember, memberId: 'a', activeChats: 5, maxConcurrency: 5 },
      { ...baseMember, memberId: 'b', activeChats: 5, maxConcurrency: 5 },
    ];
    const eligible = agents.filter((m) => evaluateMemberEligibility(m, ctx).eligible);
    assert.equal(eligible.length, 0);
  });
});
