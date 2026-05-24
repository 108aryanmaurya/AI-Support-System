import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isWithinAgentShift } from './agentShiftHours.js';

describe('isWithinAgentShift', () => {
  it('returns true when no shift configured', () => {
    assert.equal(isWithinAgentShift({ timezone: 'UTC' }), true);
  });

  it('evaluates same-day window in UTC', () => {
    const at = new Date('2026-05-23T14:00:00.000Z');
    assert.equal(
      isWithinAgentShift({ shiftStart: '09:00', shiftEnd: '17:00', timezone: 'UTC' }, at),
      true,
    );
    const late = new Date('2026-05-23T20:00:00.000Z');
    assert.equal(
      isWithinAgentShift({ shiftStart: '09:00', shiftEnd: '17:00', timezone: 'UTC' }, late),
      false,
    );
  });
});
