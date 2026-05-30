import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ORG_PERMISSIONS_AGENT_DEFAULTS } from '@ai-support/shared';
import { claimConversationOnAgentReplyIfUnassigned } from './claimConversationOnAgentReply.service.js';

describe('claimConversationOnAgentReplyIfUnassigned', () => {
  it('returns unchanged when already assigned', async () => {
    const conv = {
      id: '11111111-1111-4111-8111-111111111111',
      assigned_to_member_id: 'agent-a',
      status: 'open',
    };
    const result = await claimConversationOnAgentReplyIfUnassigned({
      userId: 'user-a',
      organizationId: '22222222-2222-4222-8222-222222222222',
      conversation: conv,
      actorMember: { id: 'agent-a', role: 'AGENT' },
      permissions: ORG_PERMISSIONS_AGENT_DEFAULTS,
    });
    assert.equal(result.claimed, false);
    assert.equal(result.conversation, conv);
  });
});
