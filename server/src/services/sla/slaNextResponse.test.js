import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  agentHasNotRepliedSinceLastCustomerMessage,
  isNextResponseSlaBreached,
  nextResponseSlaCutoffIso,
} from './slaNextResponse.js';

describe('nextResponseSlaCutoffIso', () => {
  it('subtracts SLA minutes from now', () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    const cutoff = nextResponseSlaCutoffIso(60, now);
    assert.equal(cutoff, '2026-05-26T11:00:00.000Z');
  });
});

describe('isNextResponseSlaBreached', () => {
  const now = new Date('2026-05-26T12:00:00.000Z');

  it('breaches when waiting_agent and customer message is stale', () => {
    assert.equal(
      isNextResponseSlaBreached(
        {
          status: 'open',
          waiting_status: 'waiting_agent',
          last_customer_message_at: '2026-05-26T10:00:00.000Z',
          last_agent_message_at: '2026-05-26T09:00:00.000Z',
        },
        60,
        now,
      ),
      true,
    );
  });

  it('does not breach when agent replied after customer', () => {
    assert.equal(
      isNextResponseSlaBreached(
        {
          status: 'open',
          waiting_status: 'waiting_agent',
          last_customer_message_at: '2026-05-26T10:00:00.000Z',
          last_agent_message_at: '2026-05-26T11:00:00.000Z',
        },
        60,
        now,
      ),
      false,
    );
  });

  it('ignores non waiting_agent rows', () => {
    assert.equal(
      isNextResponseSlaBreached(
        {
          status: 'open',
          waiting_status: 'waiting_customer',
          last_customer_message_at: '2026-05-26T08:00:00.000Z',
        },
        60,
        now,
      ),
      false,
    );
  });
});

describe('agentHasNotRepliedSinceLastCustomerMessage', () => {
  it('is true when no agent timestamp', () => {
    assert.equal(
      agentHasNotRepliedSinceLastCustomerMessage({
        last_customer_message_at: '2026-05-26T10:00:00.000Z',
      }),
      true,
    );
  });
});
