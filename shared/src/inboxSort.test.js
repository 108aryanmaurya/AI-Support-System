import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sortConversationsInbox } from './inboxSort.js';

describe('sortConversationsInbox', () => {
  it('reorders without clearing assigned_to_member_id on any row', () => {
    const items = [
      {
        id: 'assigned',
        assigned_to_member_id: 'member-a',
        assignment_type: 'assigned_to_agent',
        last_message_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'unassigned',
        assigned_to_member_id: null,
        assignment_type: 'unassigned',
        last_message_at: '2026-01-03T00:00:00Z',
      },
    ];

    const sorted = sortConversationsInbox(items, 'member-a');

    assert.equal(sorted.find((c) => c.id === 'assigned')?.assigned_to_member_id, 'member-a');
    assert.equal(sorted.find((c) => c.id === 'unassigned')?.assigned_to_member_id, null);
    assert.equal(sorted[0]?.id, 'unassigned');
  });
});
