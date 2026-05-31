import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isDedicatedInboxAssignmentStrategy } from '@ai-support/shared';

function pickAutoRouteWinner(preview, strategy = 'weighted_hybrid') {
  const dedicatedInboxStrategy = isDedicatedInboxAssignmentStrategy(strategy);
  if (
    !dedicatedInboxStrategy &&
    preview.previousAgentId &&
    preview.eligibleMemberIds.includes(preview.previousAgentId)
  ) {
    return preview.previousAgentId;
  }
  if (preview.recommendedMemberId) {
    return preview.recommendedMemberId;
  }
  return null;
}

describe('auto-route winner selection', () => {
  it('prefers sticky previous agent when still eligible (org hybrid)', () => {
    const preview = {
      previousAgentId: 'agent-prev',
      eligibleMemberIds: ['agent-prev', 'agent-other'],
      recommendedMemberId: 'agent-other',
    };
    assert.equal(pickAutoRouteWinner(preview, 'weighted_hybrid'), 'agent-prev');
  });

  it('uses recommended when sticky agent not eligible', () => {
    const preview = {
      previousAgentId: 'agent-prev',
      eligibleMemberIds: ['agent-other'],
      recommendedMemberId: 'agent-other',
    };
    assert.equal(pickAutoRouteWinner(preview, 'weighted_hybrid'), 'agent-other');
  });

  it('round_robin ignores sticky and uses recommended', () => {
    const preview = {
      previousAgentId: 'agent-prev',
      eligibleMemberIds: ['agent-prev', 'agent-other'],
      recommendedMemberId: 'agent-other',
    };
    assert.equal(pickAutoRouteWinner(preview, 'round_robin'), 'agent-other');
  });

  it('least_loaded (balanced) ignores sticky and uses recommended', () => {
    const preview = {
      previousAgentId: 'agent-prev',
      eligibleMemberIds: ['agent-prev', 'agent-other'],
      recommendedMemberId: 'agent-other',
    };
    assert.equal(pickAutoRouteWinner(preview, 'least_loaded'), 'agent-other');
  });
});
