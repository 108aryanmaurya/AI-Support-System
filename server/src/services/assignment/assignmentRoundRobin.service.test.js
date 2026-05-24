import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('round robin tie-break (deterministic sort)', () => {
  it('picks consistently from sorted member ids', () => {
    const tied = ['m-b', 'm-a', 'm-c'].sort();
    assert.deepEqual(tied, ['m-a', 'm-b', 'm-c']);
    assert.equal(tied[0 % 3], 'm-a');
    assert.equal(tied[1 % 3], 'm-b');
    assert.equal(tied[2 % 3], 'm-c');
  });
});
