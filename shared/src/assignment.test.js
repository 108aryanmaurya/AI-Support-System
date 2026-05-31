import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPresenceAssignable,
  normalizeAgentTimezone,
  normalizeMaxConcurrency,
  normalizeShiftTime,
} from './assignment.js';

describe('assignment validation', () => {
  it('normalizes shift times', () => {
    assert.equal(normalizeShiftTime('09:30'), '09:30');
    assert.equal(normalizeShiftTime(null), null);
    assert.throws(() => normalizeShiftTime('25:00'));
  });

  it('normalizes concurrency', () => {
    assert.equal(normalizeMaxConcurrency(undefined), 5);
    assert.equal(normalizeMaxConcurrency(8), 8);
    assert.throws(() => normalizeMaxConcurrency(0));
  });

  it('normalizes timezone', () => {
    assert.equal(normalizeAgentTimezone(''), 'UTC');
    assert.equal(normalizeAgentTimezone('America/New_York'), 'America/New_York');
  });

  it('isPresenceAssignable allows online and available only', () => {
    assert.equal(isPresenceAssignable('online'), true);
    assert.equal(isPresenceAssignable('available'), true);
    assert.equal(isPresenceAssignable('away'), false);
    assert.equal(isPresenceAssignable('offline'), false);
  });
});
