import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeConversationRecords, normalizeConversationRecord } from './conversationRecord.js';

describe('normalizeConversationRecord', () => {
  it('maps camelCase assignment fields to snake_case', () => {
    const row = normalizeConversationRecord({
      id: 'c1',
      assignedToMemberId: 'm1',
      assignmentType: 'assigned_to_agent',
    });
    assert.equal(row.assigned_to_member_id, 'm1');
    assert.equal(row.assignment_type, 'assigned_to_agent');
  });

  it('maps teamInboxId to team_inbox_id', () => {
    const row = normalizeConversationRecord({
      id: 'c1',
      teamInboxId: 'inbox-uuid',
    });
    assert.equal(row.team_inbox_id, 'inbox-uuid');
  });
});

describe('mergeConversationRecords', () => {
  it('keeps assignee when realtime row clears member without explicit unassign', () => {
    const prev = {
      id: 'c1',
      assigned_to_member_id: 'member-a',
      assignment_type: 'assigned_to_agent',
      last_message_at: '2026-01-01T00:00:00Z',
    };
    const incoming = {
      id: 'c1',
      assigned_to_member_id: null,
      assignment_type: 'assigned_to_agent',
      last_message_at: '2026-01-02T00:00:00Z',
    };
    const merged = mergeConversationRecords(prev, incoming);
    assert.equal(merged.assigned_to_member_id, 'member-a');
    assert.equal(merged.last_message_at, '2026-01-02T00:00:00Z');
  });

  it('allows explicit unassign from API', () => {
    const prev = {
      id: 'c1',
      assigned_to_member_id: 'member-a',
      assignment_type: 'assigned_to_agent',
    };
    const incoming = {
      id: 'c1',
      assigned_to_member_id: null,
      assignment_type: 'unassigned',
    };
    const merged = mergeConversationRecords(prev, incoming);
    assert.equal(merged.assigned_to_member_id, null);
    assert.equal(merged.assignment_type, 'unassigned');
  });

  it('clears assignee when team inbox assignment is applied', () => {
    const prev = {
      id: 'c1',
      assigned_to_member_id: 'member-a',
      assignment_type: 'assigned_to_agent',
      team_inbox_id: null,
    };
    const incoming = {
      id: 'c1',
      assigned_to_member_id: null,
      assignment_type: 'assigned_to_team',
      team_inbox_id: 'inbox-1',
    };
    const merged = mergeConversationRecords(prev, incoming);
    assert.equal(merged.assigned_to_member_id, null);
    assert.equal(merged.assignment_type, 'assigned_to_team');
    assert.equal(merged.team_inbox_id, 'inbox-1');
  });

  it('applies new assignee from PATCH response', () => {
    const prev = { id: 'c1', assigned_to_member_id: null, assignment_type: 'unassigned' };
    const incoming = {
      id: 'c1',
      assignedToMemberId: 'member-b',
      assignmentType: 'assigned_to_agent',
    };
    const merged = mergeConversationRecords(prev, incoming);
    assert.equal(merged.assigned_to_member_id, 'member-b');
    assert.equal(merged.assignment_type, 'assigned_to_agent');
  });
});
