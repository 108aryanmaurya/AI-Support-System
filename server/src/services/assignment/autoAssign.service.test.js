import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('auto-route winner selection', () => {
  it('prefers sticky previous agent when still eligible', () => {
    const preview = {
      previousAgentId: 'agent-prev',
      eligibleMemberIds: ['agent-prev', 'agent-other'],
      recommendedMemberId: 'agent-other',
      rankedCandidates: [
        { memberId: 'agent-other', finalScore: 90 },
        { memberId: 'agent-prev', finalScore: 70 },
      ],
    };

    let winnerId = null;
    if (
      preview.previousAgentId &&
      preview.eligibleMemberIds.includes(preview.previousAgentId)
    ) {
      winnerId = preview.previousAgentId;
    } else if (preview.recommendedMemberId) {
      winnerId = preview.recommendedMemberId;
    }

    assert.equal(winnerId, 'agent-prev');
  });

  it('uses recommended when sticky agent not eligible', () => {
    const preview = {
      previousAgentId: 'agent-prev',
      eligibleMemberIds: ['agent-other'],
      recommendedMemberId: 'agent-other',
    };

    let winnerId = null;
    if (
      preview.previousAgentId &&
      preview.eligibleMemberIds.includes(preview.previousAgentId)
    ) {
      winnerId = preview.previousAgentId;
    } else if (preview.recommendedMemberId) {
      winnerId = preview.recommendedMemberId;
    }

    assert.equal(winnerId, 'agent-other');
  });
});
