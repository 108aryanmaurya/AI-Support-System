import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateMemberEligibility } from './assignmentEligibility.filters.js';

const baseMember = {
  memberId: 'm1',
  role: 'AGENT',
  membershipStatus: 'ACTIVE',
  routingStatus: 'active',
  maxConcurrency: 5,
  shiftStart: null,
  shiftEnd: null,
  timezone: 'UTC',
  presence: 'online',
  activeChats: 2,
};

const baseCtx = {
  now: new Date('2026-05-30T12:00:00Z'),
  targetInboxId: 'inbox-1',
  inboxMemberIds: ['m1'],
  intent: 'billing_issue',
  language: 'en',
  tagNames: [],
};

describe('evaluateMemberEligibility', () => {
  it('passes when member is assignable', () => {
    const r = evaluateMemberEligibility(baseMember, baseCtx);
    assert.equal(r.eligible, true);
    assert.equal(r.drops.length, 0);
  });

  it('drops when not inbox member', () => {
    const r = evaluateMemberEligibility(
      { ...baseMember, memberId: 'm2' },
      { ...baseCtx, inboxMemberIds: ['m1'] },
    );
    assert.equal(r.eligible, false);
    assert.ok(r.drops.some((d) => d.code === 'inbox_not_member'));
  });

  it('drops at concurrency limit', () => {
    const r = evaluateMemberEligibility(
      { ...baseMember, activeChats: 5, maxConcurrency: 5 },
      baseCtx,
    );
    assert.ok(r.drops.some((d) => d.code === 'at_concurrency_limit'));
  });
});
