import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isIdentifiedCustomer,
  visitorHasChatContinuity,
  canAccessConversationHistory,
} from './widgetCustomer.service.js';

describe('isIdentifiedCustomer', () => {
  it('true when user_id is set', () => {
    assert.equal(isIdentifiedCustomer({ user_id: 'acct_1' }), true);
  });

  it('false for lead without user_id', () => {
    assert.equal(isIdentifiedCustomer({ user_id: null, customer_type: 'LEAD' }), false);
    assert.equal(isIdentifiedCustomer(null), false);
  });
});

describe('visitorHasChatContinuity', () => {
  it('true when visitor linked to customer (email captured)', () => {
    assert.equal(visitorHasChatContinuity({ customer_id: 'cust-1' }), true);
  });

  it('false for fresh anonymous visitor', () => {
    assert.equal(visitorHasChatContinuity({ customer_id: null }), false);
  });
});

describe('canAccessConversationHistory', () => {
  it('true for lead with customer_id on visitor', () => {
    assert.equal(
      canAccessConversationHistory({
        customer: { id: 'c1', user_id: null },
        visitor: { customer_id: 'c1' },
      }),
      true,
    );
  });
});
