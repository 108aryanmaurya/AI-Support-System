import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReminderBody, buildReminderSubject } from './lifecycleReminderContent.js';
import {
  customerRepliedSinceWaiting,
  isWaitingCloseAfterReminderCandidate,
  isWaitingReminderCandidate,
} from './lifecycleWaiting.js';

describe('isWaitingReminderCandidate', () => {
  it('requires waiting_customer and no prior reminder', () => {
    assert.equal(
      isWaitingReminderCandidate(
        {
          status: 'open',
          waiting_status: 'waiting_customer',
          last_customer_message_at: '2026-05-01T00:00:00.000Z',
          customer_reminder_sent_at: null,
        },
        '2026-05-10T00:00:00.000Z',
      ),
      true,
    );
    assert.equal(
      isWaitingReminderCandidate(
        {
          status: 'open',
          waiting_status: 'waiting_customer',
          last_customer_message_at: '2026-05-20T00:00:00.000Z',
          customer_reminder_sent_at: null,
        },
        '2026-05-10T00:00:00.000Z',
      ),
      false,
    );
  });
});

describe('isWaitingCloseAfterReminderCandidate', () => {
  it('closes when reminder is old and no customer reply after', () => {
    assert.equal(
      isWaitingCloseAfterReminderCandidate(
        {
          status: 'open',
          waiting_status: 'waiting_customer',
          customer_reminder_sent_at: '2026-05-01T00:00:00.000Z',
          last_customer_message_at: '2026-04-28T00:00:00.000Z',
        },
        '2026-05-10T00:00:00.000Z',
      ),
      true,
    );
  });

  it('skips when customer replied after reminder', () => {
    assert.equal(
      isWaitingCloseAfterReminderCandidate(
        {
          status: 'open',
          waiting_status: 'waiting_customer',
          customer_reminder_sent_at: '2026-05-01T00:00:00.000Z',
          last_customer_message_at: '2026-05-05T00:00:00.000Z',
        },
        '2026-05-10T00:00:00.000Z',
      ),
      false,
    );
  });
});

describe('customerRepliedSinceWaiting', () => {
  it('detects customer message newer than agent', () => {
    assert.equal(
      customerRepliedSinceWaiting({
        last_customer_message_at: '2026-05-10T12:00:00.000Z',
        last_agent_message_at: '2026-05-09T12:00:00.000Z',
      }),
      true,
    );
  });
});

describe('buildReminderSubject', () => {
  it('prefixes Re when subject present', () => {
    assert.equal(buildReminderSubject('Hello'), 'Re: Hello');
  });

  it('uses fallback when empty', () => {
    assert.equal(buildReminderSubject(''), 'Following up on your request');
  });
});

describe('buildReminderBody', () => {
  it('mentions auto-close window after reminder', () => {
    const body = buildReminderBody({ name: 'Alex' }, 3, 7);
    assert.match(body, /Hi Alex/);
    assert.match(body, /closed automatically/i);
    assert.match(body, /about 7 days/);
  });
});
