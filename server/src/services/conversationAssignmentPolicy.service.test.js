import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ORG_PERMISSIONS_ADMIN_DEFAULTS, ORG_PERMISSIONS_AGENT_DEFAULTS } from '@ai-support/shared';
import {
  assertConversationAssignmentAllowed,
  assertConversationCustomerReplyAllowed,
} from './conversationAssignmentPolicy.service.js';
import { HttpError } from '../utils/httpError.js';

const actor = { id: 'agent-a', role: 'AGENT' };

describe('assertConversationAssignmentAllowed', () => {
  it('allows self-claim from unassigned', () => {
    const result = assertConversationAssignmentAllowed({
      actorMember: actor,
      priorAssigneeId: null,
      nextAssigneeId: 'agent-a',
      permissions: ORG_PERMISSIONS_AGENT_DEFAULTS,
      mode: 'claim',
    });
    assert.equal(result.assignmentLogReason, 'claim');
  });

  it('denies steal from another agent', () => {
    assert.throws(
      () =>
        assertConversationAssignmentAllowed({
          actorMember: actor,
          priorAssigneeId: 'agent-b',
          nextAssigneeId: 'agent-a',
          permissions: ORG_PERMISSIONS_AGENT_DEFAULTS,
        }),
      (e) => e instanceof HttpError && e.status === 403,
    );
  });

  it('allows admin override', () => {
    const result = assertConversationAssignmentAllowed({
      actorMember: { id: 'admin-1', role: 'ADMIN' },
      priorAssigneeId: 'agent-b',
      nextAssigneeId: 'admin-1',
      permissions: ORG_PERMISSIONS_ADMIN_DEFAULTS,
    });
    assert.equal(result.assignmentLogReason, 'admin_override');
  });

  it('allows agent to unassign own thread', () => {
    const result = assertConversationAssignmentAllowed({
      actorMember: actor,
      priorAssigneeId: 'agent-a',
      nextAssigneeId: null,
      permissions: ORG_PERMISSIONS_AGENT_DEFAULTS,
    });
    assert.equal(result.assignmentLogReason, 'unassign');
  });
});

describe('assertConversationCustomerReplyAllowed', () => {
  it('allows reply when assigned to self', () => {
    assert.doesNotThrow(() =>
      assertConversationCustomerReplyAllowed({
        actorMember: actor,
        assignedToMemberId: 'agent-a',
        permissions: ORG_PERMISSIONS_AGENT_DEFAULTS,
      }),
    );
  });

  it('denies reply when assigned to another agent', () => {
    assert.throws(
      () =>
        assertConversationCustomerReplyAllowed({
          actorMember: actor,
          assignedToMemberId: 'agent-b',
          permissions: ORG_PERMISSIONS_AGENT_DEFAULTS,
        }),
      (e) => e instanceof HttpError && e.status === 403,
    );
  });

  it('allows admin reply on another assignee thread', () => {
    assert.doesNotThrow(() =>
      assertConversationCustomerReplyAllowed({
        actorMember: { id: 'admin-1', role: 'ADMIN' },
        assignedToMemberId: 'agent-b',
        permissions: ORG_PERMISSIONS_ADMIN_DEFAULTS,
      }),
    );
  });
});
