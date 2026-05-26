import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getConversationLifecycleDetailHint,
  getConversationLifecycleListBadges,
  isReopenedConversation,
} from './conversationLifecycleBadges.js';

describe('getConversationLifecycleListBadges', () => {
  it('shows Resolved for resolved status', () => {
    const badges = getConversationLifecycleListBadges({ status: 'resolved' });
    assert.ok(badges.some((b) => b.id === 'lifecycle_resolved'));
  });

  it('shows Waiting on customer badge', () => {
    const badges = getConversationLifecycleListBadges({
      status: 'open',
      waiting_status: 'waiting_customer',
    });
    assert.ok(badges.some((b) => b.id === 'lifecycle_waiting_customer'));
  });

  it('shows Waiting on agent badge', () => {
    const badges = getConversationLifecycleListBadges({
      status: 'open',
      waiting_status: 'waiting_agent',
    });
    assert.ok(badges.some((b) => b.id === 'lifecycle_waiting_agent'));
  });

  it('shows Reopened when metadata has reopened_at', () => {
    const conv = {
      status: 'open',
      metadata: { lifecycle: { reopened_at: '2026-05-01T00:00:00.000Z' } },
    };
    assert.equal(isReopenedConversation(conv), true);
    assert.ok(getConversationLifecycleListBadges(conv).some((b) => b.id === 'lifecycle_reopened'));
  });
});

describe('getConversationLifecycleDetailHint', () => {
  const settings = {
    enabled: true,
    resolved_auto_close_days: 14,
    waiting_reminder_days: 3,
    waiting_auto_close_after_reminder_days: 7,
    customer_reminder_enabled: true,
  };

  it('returns null when lifecycle disabled', () => {
    assert.equal(
      getConversationLifecycleDetailHint({ status: 'resolved' }, { ...settings, enabled: false }),
      null,
    );
  });

  it('hints for resolved conversations', () => {
    const hint = getConversationLifecycleDetailHint(
      {
        status: 'resolved',
        last_message_at: new Date().toISOString(),
      },
      settings,
    );
    assert.match(hint ?? '', /Closes in ~\d+ day/);
  });

  it('hints for waiting_agent', () => {
    const hint = getConversationLifecycleDetailHint(
      { status: 'open', waiting_status: 'waiting_agent' },
      settings,
    );
    assert.match(hint ?? '', /awaiting agent/i);
  });
});
