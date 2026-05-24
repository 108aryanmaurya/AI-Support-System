import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveAssignmentLogReason } from './assignmentLog.service.js';

describe('resolveAssignmentLogReason', () => {
  it('returns manual for agent updates', () => {
    assert.equal(
      resolveAssignmentLogReason({
        automationSource: false,
        assignedToMemberId: 'm1',
        assignmentType: 'assigned_to_agent',
      }),
      'manual',
    );
  });

  it('returns workflow when automation has ruleId', () => {
    assert.equal(
      resolveAssignmentLogReason({
        automationSource: true,
        workflowMeta: { ruleId: 'r1', actionType: 'set_assignment' },
        assignedToMemberId: 'm1',
      }),
      'workflow',
    );
  });

  it('returns unassign when clearing assignee', () => {
    assert.equal(
      resolveAssignmentLogReason({
        automationSource: false,
        assignedToMemberId: null,
        assignmentType: 'unassigned',
      }),
      'unassign',
    );
  });
});
