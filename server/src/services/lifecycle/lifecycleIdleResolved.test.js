import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isResolvedIdleCandidate, resolvedIdleCutoffIso } from './lifecycleIdleResolved.js';

describe('resolvedIdleCutoffIso', () => {
  it('subtracts N days from now', () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    const cutoff = resolvedIdleCutoffIso(14, now);
    assert.equal(cutoff, '2026-05-12T12:00:00.000Z');
  });

  it('falls back to 14 days for invalid input', () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    const cutoff = resolvedIdleCutoffIso(0, now);
    assert.equal(cutoff, '2026-05-12T12:00:00.000Z');
  });
});

describe('isResolvedIdleCandidate', () => {
  it('matches resolved rows older than cutoff', () => {
    assert.equal(
      isResolvedIdleCandidate(
        { status: 'resolved', last_message_at: '2026-05-01T00:00:00.000Z' },
        '2026-05-10T00:00:00.000Z',
      ),
      true,
    );
  });

  it('rejects active or recent resolved rows', () => {
    assert.equal(
      isResolvedIdleCandidate(
        { status: 'open', last_message_at: '2026-05-01T00:00:00.000Z' },
        '2026-05-10T00:00:00.000Z',
      ),
      false,
    );
    assert.equal(
      isResolvedIdleCandidate(
        { status: 'resolved', last_message_at: '2026-05-20T00:00:00.000Z' },
        '2026-05-10T00:00:00.000Z',
      ),
      false,
    );
  });
});
