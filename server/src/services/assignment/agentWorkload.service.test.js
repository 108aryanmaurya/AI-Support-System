import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { conversationCountsTowardWorkload } from './agentWorkload.service.js';

describe('conversationCountsTowardWorkload', () => {
  it('counts open assigned_to_agent threads', () => {
    assert.equal(
      conversationCountsTowardWorkload({
        assigned_to_member_id: 'm1',
        assignment_type: 'assigned_to_agent',
        status: 'open',
      }),
      true,
    );
  });

  it('excludes closed or unassigned', () => {
    assert.equal(
      conversationCountsTowardWorkload({
        assigned_to_member_id: 'm1',
        assignment_type: 'assigned_to_agent',
        status: 'closed',
      }),
      false,
    );
    assert.equal(
      conversationCountsTowardWorkload({
        assignment_type: 'unassigned',
        status: 'open',
      }),
      false,
    );
  });
});
