import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldResetPriorityAfterSlaCleared } from './workflowConversationFlags.service.js';

test('shouldResetPriorityAfterSlaCleared matches SLA workflow priority only', () => {
  assert.equal(shouldResetPriorityAfterSlaCleared('urgent', 'urgent'), true);
  assert.equal(shouldResetPriorityAfterSlaCleared('high', 'urgent'), false);
  assert.equal(shouldResetPriorityAfterSlaCleared('medium', 'urgent'), false);
});

test('shouldResetPriorityAfterSlaCleared legacy urgent/high without tracked SLA priority', () => {
  assert.equal(shouldResetPriorityAfterSlaCleared('urgent', null), true);
  assert.equal(shouldResetPriorityAfterSlaCleared('high', null), true);
  assert.equal(shouldResetPriorityAfterSlaCleared('low', null), false);
});
