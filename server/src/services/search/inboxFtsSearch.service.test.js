import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SEARCH_ERROR_CODES } from '@ai-support/shared';
import {
  inboxSearchUnavailableError,
  isMissingInboxSearchRpc,
  mapConversationFtsRow,
  mapCustomerFtsRow,
  mapMessageFtsRow,
} from './inboxFtsSearch.service.js';

describe('inboxFtsSearch.service', () => {
  it('isMissingInboxSearchRpc detects missing function errors', () => {
    assert.equal(isMissingInboxSearchRpc({ code: '42883' }), true);
    assert.equal(
      isMissingInboxSearchRpc({ message: 'function search_inbox_conversations does not exist' }),
      true,
    );
    assert.equal(isMissingInboxSearchRpc({ message: 'other' }), false);
  });

  it('inboxSearchUnavailableError maps to 503 unavailable', () => {
    const err = inboxSearchUnavailableError({ code: '42883' });
    assert.equal(err.status, 503);
    assert.equal(err.code, SEARCH_ERROR_CODES.unavailable);
  });

  it('mapConversationFtsRow preserves rank and snippet', () => {
    const row = mapConversationFtsRow(
      {
        conversation_id: 'c1',
        subject: 'Refund request',
        status: 'open',
        priority: 'high',
        channel_type: 'email',
        assigned_to_member_id: null,
        last_message_at: '2026-01-01T00:00:00Z',
        customer_name: 'Jane',
        customer_email: 'jane@example.com',
        rank: 0.91,
        snippet: 'Refund <mark>request</mark>',
      },
      ['status'],
    );
    assert.equal(row.entityType, 'conversation');
    assert.equal(row.entityId, 'c1');
    assert.equal(row.rank, 0.91);
    assert.match(row.snippet, /request/);
    assert.deepEqual(row.matchedFields, ['status', 'text']);
  });

  it('mapMessageFtsRow includes conversationId for deep links', () => {
    const row = mapMessageFtsRow({
      message_id: 'm1',
      conversation_id: 'c1',
      content: 'charged twice',
      sender_type: 'customer',
      created_at: '2026-01-01T00:00:00Z',
      conversation_subject: 'Billing',
      customer_name: null,
      customer_email: 'a@b.com',
      rank: 0.5,
      snippet: 'charged <mark>twice</mark>',
    });
    assert.equal(row.conversationId, 'c1');
    assert.equal(row.title, 'Billing');
  });

  it('mapCustomerFtsRow maps customer fields', () => {
    const row = mapCustomerFtsRow({
      customer_id: 'u1',
      name: 'Acme',
      email: 'ops@acme.com',
      phone: null,
      external_id: null,
      customer_type: 'USER',
      rank: 0.7,
      snippet: '<mark>Acme</mark>',
    });
    assert.equal(row.entityType, 'customer');
    assert.equal(row.metadata.email, 'ops@acme.com');
  });
});
