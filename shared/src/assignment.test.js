import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPresenceAssignable,
  normalizeAgentTimezone,
  normalizeMaxConcurrency,
  normalizeShiftTime,
  validateAgentSkillsPayload,
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

  it('validates and normalizes skills', () => {
    const skills = validateAgentSkillsPayload([
      { skill: 'Billing', proficiency: 80 },
      { skill: 'technical', proficiency: 40 },
    ]);
    assert.equal(skills.length, 2);
    assert.equal(skills[0].skill, 'billing');
    assert.throws(() =>
      validateAgentSkillsPayload([
        { skill: 'a', proficiency: 1 },
        { skill: 'A', proficiency: 2 },
      ]),
    );
  });

  it('rejects too many skills', () => {
    const many = Array.from({ length: 33 }, (_, i) => ({ skill: `s${i}` }));
    assert.throws(() => validateAgentSkillsPayload(many));
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
