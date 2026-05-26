import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isConversationTerminalStatus } from '@ai-support/shared';
import {
  evaluateEmailThreadReopenDecision,
  shouldReopenConversation,
} from './conversationLifecycle.rules.js';
import { isResolvedIdleCandidate, resolvedIdleCutoffIso } from './lifecycleIdleResolved.js';
import {
  customerRepliedSinceWaiting,
  daysAgoIso,
  isWaitingCloseAfterReminderCandidate,
  isWaitingReminderCandidate,
} from './lifecycleWaiting.js';

const lifecycleEnabled = {
  enabled: true,
  reopen_on_customer_message: true,
  new_conversation_after_closed_days: 90,
  resolved_auto_close_days: 14,
  waiting_reminder_days: 3,
  waiting_auto_close_after_reminder_days: 7,
  customer_reminder_enabled: true,
};

/**
 * Mirrors email webhook path before DB reopen (see `maybeReopenEmailThreadConversation`).
 */
function simulateEmailWebhookReopen({ conversation, matchedBy, orgSettings }) {
  return evaluateEmailThreadReopenDecision({ conversation, matchedBy, orgSettings });
}

describe('integration: email webhook reopen flow', () => {
  it('reopens resolved thread when In-Reply-To matches existing conversation', () => {
    const decision = simulateEmailWebhookReopen({
      conversation: {
        id: 'conv-1',
        status: 'resolved',
        last_message_at: new Date().toISOString(),
      },
      matchedBy: 'in_reply_to',
      orgSettings: lifecycleEnabled,
    });
    assert.equal(decision.shouldReopen, true);
    assert.equal(decision.reason, 'customer_reply_email');
  });

  it('does not reopen when thread is new (no prior conversation)', () => {
    const decision = simulateEmailWebhookReopen({
      conversation: { id: 'conv-new', status: 'open' },
      matchedBy: 'new',
      orgSettings: lifecycleEnabled,
    });
    assert.equal(decision.shouldReopen, false);
    assert.equal(decision.reason, 'new_thread');
  });

  it('does not reopen active conversations', () => {
    const decision = simulateEmailWebhookReopen({
      conversation: { id: 'conv-2', status: 'open', waiting_status: 'waiting_customer' },
      matchedBy: 'message_id',
      orgSettings: lifecycleEnabled,
    });
    assert.equal(decision.shouldReopen, false);
    assert.equal(decision.reason, 'not_terminal');
  });

  it('does not reopen stale closed email threads beyond M days', () => {
    const old = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    const decision = simulateEmailWebhookReopen({
      conversation: { id: 'conv-3', status: 'closed', closed_at: old, last_message_at: old },
      matchedBy: 'in_reply_to',
      orgSettings: { ...lifecycleEnabled, new_conversation_after_closed_days: 30 },
    });
    assert.equal(decision.shouldReopen, false);
    assert.equal(decision.reason, 'policy_blocked');
  });
});

describe('integration: lifecycle cron candidate rows', () => {
  const now = new Date('2026-05-26T12:00:00.000Z');
  const resolvedCutoff = resolvedIdleCutoffIso(14, now);
  const reminderCutoff = daysAgoIso(3, now);
  const waitingCloseCutoff = daysAgoIso(7, now);

  const sampleResolvedRows = [
    {
      id: 'r-idle',
      status: 'resolved',
      last_message_at: '2026-05-01T00:00:00.000Z',
      is_spam: false,
    },
    {
      id: 'r-recent',
      status: 'resolved',
      last_message_at: '2026-05-20T00:00:00.000Z',
      is_spam: false,
    },
    { id: 'r-open', status: 'open', last_message_at: '2026-05-01T00:00:00.000Z', is_spam: false },
  ];

  it('selects only idle resolved conversations for auto-close enqueue', () => {
    const candidates = sampleResolvedRows.filter(
      (row) => !row.is_spam && isResolvedIdleCandidate(row, resolvedCutoff),
    );
    assert.deepEqual(
      candidates.map((r) => r.id),
      ['r-idle'],
    );
  });

  const sampleWaitingRows = [
    {
      id: 'w-remind',
      status: 'open',
      waiting_status: 'waiting_customer',
      last_customer_message_at: '2026-05-20T00:00:00.000Z',
      last_agent_message_at: '2026-05-21T00:00:00.000Z',
      customer_reminder_sent_at: null,
    },
    {
      id: 'w-reminded',
      status: 'open',
      waiting_status: 'waiting_customer',
      last_customer_message_at: '2026-05-10T00:00:00.000Z',
      last_agent_message_at: '2026-05-11T00:00:00.000Z',
      customer_reminder_sent_at: '2026-05-12T00:00:00.000Z',
    },
    {
      id: 'w-replied',
      status: 'open',
      waiting_status: 'waiting_customer',
      last_customer_message_at: '2026-05-22T00:00:00.000Z',
      last_agent_message_at: '2026-05-21T00:00:00.000Z',
      customer_reminder_sent_at: null,
    },
  ];

  it('selects waiting rows due for reminder and excludes customer-replied-since-waiting', () => {
    const candidates = sampleWaitingRows.filter(
      (row) =>
        isWaitingReminderCandidate(row, reminderCutoff) && !customerRepliedSinceWaiting(row),
    );
    assert.deepEqual(
      candidates.map((r) => r.id),
      ['w-remind'],
    );
  });

  it('selects waiting rows eligible to close after reminder + silence', () => {
    const candidates = sampleWaitingRows.filter((row) =>
      isWaitingCloseAfterReminderCandidate(row, waitingCloseCutoff),
    );
    assert.deepEqual(
      candidates.map((r) => r.id),
      ['w-reminded'],
    );
  });
});

describe('integration: terminal status helpers', () => {
  it('aligns shared terminal check with reopen rules', () => {
    for (const status of ['resolved', 'closed']) {
      assert.equal(isConversationTerminalStatus(status), true);
      assert.equal(
        shouldReopenConversation({
          conversation: { status, last_message_at: new Date().toISOString() },
          channel: 'email',
          payload: { threadMatched: true },
          orgSettings: lifecycleEnabled,
        }),
        true,
      );
    }
    assert.equal(isConversationTerminalStatus('open'), false);
  });
});
