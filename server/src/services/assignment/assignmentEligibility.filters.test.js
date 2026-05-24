import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateMemberEligibility } from './assignmentEligibility.filters.js';

const baseCtx = {
  now: new Date('2026-05-23T14:00:00.000Z'),
  targetInboxId: 'default',
  inboxMemberIds: null,
  intent: 'billing_issue',
  language: 'en',
  tagNames: [],
};

const baseMember = {
  memberId: 'm1',
  role: 'AGENT',
  membershipStatus: 'ACTIVE',
  routingStatus: 'active',
  maxConcurrency: 5,
  shiftStart: '09:00',
  shiftEnd: '17:00',
  timezone: 'UTC',
  skills: ['billing_issue'],
  presence: 'online',
  activeChats: 2,
};

describe('evaluateMemberEligibility', () => {
  it('passes fully eligible agent', () => {
    const r = evaluateMemberEligibility(baseMember, baseCtx);
    assert.equal(r.eligible, true);
    assert.equal(r.skillMatchTier, 'exact');
  });

  it('drops inactive routing status', () => {
    const r = evaluateMemberEligibility({ ...baseMember, routingStatus: 'inactive' }, baseCtx);
    assert.equal(r.eligible, false);
    assert.ok(r.drops.some((d) => d.code === 'agent_inactive'));
  });

  it('drops non-assignable presence', () => {
    const r = evaluateMemberEligibility({ ...baseMember, presence: 'away' }, baseCtx);
    assert.ok(r.drops.some((d) => d.code === 'presence_not_assignable'));
  });

  it('drops outside shift', () => {
    const r = evaluateMemberEligibility(
      { ...baseMember, shiftStart: '09:00', shiftEnd: '12:00' },
      { ...baseCtx, now: new Date('2026-05-23T14:00:00.000Z') },
    );
    assert.ok(r.drops.some((d) => d.code === 'outside_shift'));
  });

  it('drops inbox restriction', () => {
    const r = evaluateMemberEligibility(baseMember, {
      ...baseCtx,
      inboxMemberIds: ['other-member'],
    });
    assert.ok(r.drops.some((d) => d.code === 'inbox_not_member'));
  });

  it('drops skill mismatch', () => {
    const r = evaluateMemberEligibility(
      { ...baseMember, skills: ['legal'] },
      { ...baseCtx, intent: 'technical_support' },
    );
    assert.ok(r.drops.some((d) => d.code === 'no_skill_match'));
  });

  it('drops at concurrency limit', () => {
    const r = evaluateMemberEligibility(
      { ...baseMember, activeChats: 5, maxConcurrency: 5 },
      baseCtx,
    );
    assert.ok(r.drops.some((d) => d.code === 'at_concurrency_limit'));
  });
});
