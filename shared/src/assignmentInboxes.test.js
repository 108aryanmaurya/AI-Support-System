import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeOrgAssignmentRouting } from './assignmentInboxes.js';

describe('mergeOrgAssignmentRouting', () => {
  it('provides default inbox when missing', () => {
    const r = mergeOrgAssignmentRouting({});
    assert.equal(r.defaultInboxId, 'default');
    assert.ok(r.inboxes.some((i) => i.id === 'default'));
  });

  it('merges custom inboxes', () => {
    const r = mergeOrgAssignmentRouting({
      inboxes: [{ id: 'billing', name: 'Billing', memberIds: ['m1'] }],
      channelInboxMap: { email: 'billing' },
    });
    assert.equal(r.channelInboxMap.email, 'billing');
    assert.ok(r.inboxes.some((i) => i.id === 'billing'));
  });
});
