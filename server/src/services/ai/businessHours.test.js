import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isWithinBusinessHours } from './businessHours.service.js';

describe('isWithinBusinessHours', () => {
  const schedule = {
    enabled: true,
    timezone: 'UTC',
    start: '09:00',
    end: '17:00',
    days: [1, 2, 3, 4, 5],
  };

  it('returns true mid-week during window (UTC)', () => {
    const at = new Date('2026-05-20T12:00:00.000Z');
    assert.equal(isWithinBusinessHours(schedule, at), true);
  });

  it('returns false on Sunday', () => {
    const at = new Date('2026-05-24T12:00:00.000Z');
    assert.equal(isWithinBusinessHours(schedule, at), false);
  });

  it('returns false before start', () => {
    const at = new Date('2026-05-20T07:00:00.000Z');
    assert.equal(isWithinBusinessHours(schedule, at), false);
  });
});
