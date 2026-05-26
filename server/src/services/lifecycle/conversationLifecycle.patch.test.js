import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLifecycleColumnsForStatusChange,
  resolveLifecycleStatusEventType,
} from './conversationLifecycle.patch.js';

describe('buildLifecycleColumnsForStatusChange', () => {
  it('sets resolved audit fields', () => {
    const patch = buildLifecycleColumnsForStatusChange({
      prior: { status: 'open' },
      nextStatus: 'resolved',
      actorMemberId: 'member-1',
    });
    assert.equal(patch.resolved_by_member_id, 'member-1');
    assert.ok(patch.resolved_at);
    assert.equal(patch.closed_at, null);
  });

  it('clears waiting_status when resolved or closed', () => {
    assert.equal(
      buildLifecycleColumnsForStatusChange({
        prior: { status: 'open', waiting_status: 'waiting_agent' },
        nextStatus: 'resolved',
        actorMemberId: 'm1',
      }).waiting_status,
      '',
    );
    assert.equal(
      buildLifecycleColumnsForStatusChange({
        prior: { status: 'open' },
        nextStatus: 'closed',
        actorMemberId: null,
      }).waiting_status,
      '',
    );
  });

  it('sets manual close fields', () => {
    const patch = buildLifecycleColumnsForStatusChange({
      prior: { status: 'open' },
      nextStatus: 'closed',
      actorMemberId: 'member-1',
    });
    assert.equal(patch.closed_reason, 'manual');
    assert.ok(patch.closed_at);
  });

  it('sets auto_idle_resolved when closing via automation', () => {
    const patch = buildLifecycleColumnsForStatusChange({
      prior: { status: 'resolved' },
      nextStatus: 'closed',
      actorMemberId: null,
      closedReason: 'auto_idle_resolved',
    });
    assert.equal(patch.closed_reason, 'auto_idle_resolved');
    assert.equal(patch.resolved_at, null);
  });

  it('clears resolved when leaving resolved', () => {
    const patch = buildLifecycleColumnsForStatusChange({
      prior: { status: 'resolved' },
      nextStatus: 'open',
      actorMemberId: 'member-1',
    });
    assert.equal(patch.resolved_at, null);
    assert.equal(patch.resolved_by_member_id, null);
  });
});

describe('resolveLifecycleStatusEventType', () => {
  it('emits resolved vs closed distinctly', () => {
    assert.equal(resolveLifecycleStatusEventType('open', 'resolved'), 'conversation.resolved');
    assert.equal(resolveLifecycleStatusEventType('open', 'closed'), 'conversation.closed');
    assert.equal(resolveLifecycleStatusEventType('closed', 'open'), 'conversation.reopened');
    assert.equal(resolveLifecycleStatusEventType('open', 'pending'), null);
  });
});
