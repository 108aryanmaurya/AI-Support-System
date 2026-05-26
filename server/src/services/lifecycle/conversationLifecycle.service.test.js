import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isConversationTerminalStatus } from '@ai-support/shared';
import {
  evaluateEmailThreadReopenDecision,
  isActiveConversationStatus,
  isTerminalStatus,
  shouldReopenConversation,
} from './conversationLifecycle.rules.js';

describe('isTerminalStatus', () => {
  it('treats resolved and closed as terminal', () => {
    assert.equal(isTerminalStatus('resolved'), true);
    assert.equal(isTerminalStatus('closed'), true);
    assert.equal(isTerminalStatus('open'), false);
  });
});

describe('isActiveConversationStatus', () => {
  it('includes open and pending only', () => {
    assert.equal(isActiveConversationStatus('open'), true);
    assert.equal(isActiveConversationStatus('pending'), true);
    assert.equal(isActiveConversationStatus('waiting_customer'), false);
    assert.equal(isActiveConversationStatus('closed'), false);
  });
});

describe('shouldReopenConversation', () => {
  const baseLifecycle = { reopen_on_customer_message: true, new_conversation_after_closed_days: 90 };

  it('reopens resolved email thread hit when flag enabled', () => {
    assert.equal(
      shouldReopenConversation({
        conversation: { status: 'resolved', last_message_at: new Date().toISOString() },
        channel: 'email',
        payload: { threadMatched: true },
        orgSettings: baseLifecycle,
      }),
      true,
    );
  });

  it('does not reopen email without thread match', () => {
    assert.equal(
      shouldReopenConversation({
        conversation: { status: 'closed', closed_at: new Date().toISOString() },
        channel: 'email',
        payload: { threadMatched: false },
        orgSettings: baseLifecycle,
      }),
      false,
    );
  });

  it('does not reopen when reopen_on_customer_message is false', () => {
    assert.equal(
      shouldReopenConversation({
        conversation: { status: 'resolved' },
        channel: 'email',
        payload: { threadMatched: true },
        orgSettings: { ...baseLifecycle, reopen_on_customer_message: false },
      }),
      false,
    );
  });

  it('does not reopen stale closed conversations', () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(
      shouldReopenConversation({
        conversation: { status: 'closed', closed_at: old, last_message_at: old },
        channel: 'web',
        payload: {},
        orgSettings: { ...baseLifecycle, new_conversation_after_closed_days: 30 },
      }),
      false,
    );
  });

  it('reopens recent closed web conversations', () => {
    assert.equal(
      shouldReopenConversation({
        conversation: {
          status: 'closed',
          closed_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        },
        channel: 'web',
        payload: {},
        orgSettings: baseLifecycle,
      }),
      true,
    );
  });

  it('ignores non-terminal statuses', () => {
    assert.equal(
      shouldReopenConversation({
        conversation: { status: 'open' },
        channel: 'web',
        payload: {},
        orgSettings: baseLifecycle,
      }),
      false,
    );
  });
});

describe('evaluateEmailThreadReopenDecision', () => {
  const baseLifecycle = { reopen_on_customer_message: true, new_conversation_after_closed_days: 90 };

  it('returns customer_reply_email for resolved thread hit', () => {
    const d = evaluateEmailThreadReopenDecision({
      conversation: { id: 'c1', status: 'resolved' },
      matchedBy: 'in_reply_to',
      orgSettings: baseLifecycle,
    });
    assert.equal(d.shouldReopen, true);
    assert.equal(d.reason, 'customer_reply_email');
  });

  it('blocks new threads', () => {
    const d = evaluateEmailThreadReopenDecision({
      conversation: { id: 'c1', status: 'resolved' },
      matchedBy: 'new',
      orgSettings: baseLifecycle,
    });
    assert.equal(d.shouldReopen, false);
    assert.equal(d.reason, 'new_thread');
  });
});

describe('isConversationTerminalStatus (shared)', () => {
  it('matches isTerminalStatus alias', () => {
    assert.equal(isTerminalStatus('resolved'), isConversationTerminalStatus('resolved'));
    assert.equal(isTerminalStatus('closed'), isConversationTerminalStatus('closed'));
    assert.equal(isConversationTerminalStatus('open'), false);
  });
});
