import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getConversationWaitingStatus,
  normalizeConversationWaitingStatus,
} from './conversationWaitingStatus.js';

describe('normalizeConversationWaitingStatus', () => {
  it('normalizes empty and valid values', () => {
    assert.equal(normalizeConversationWaitingStatus(null), '');
    assert.equal(normalizeConversationWaitingStatus('waiting_agent'), 'waiting_agent');
    assert.equal(normalizeConversationWaitingStatus('invalid'), '');
  });
});

describe('getConversationWaitingStatus', () => {
  it('reads waiting_status column', () => {
    assert.equal(
      getConversationWaitingStatus({ status: 'open', waiting_status: 'waiting_agent' }),
      'waiting_agent',
    );
  });
});
