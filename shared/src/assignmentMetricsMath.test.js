import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, stddevActiveChats } from './assignmentMetricsMath.js';

test('percentile p50 and p95', () => {
  const vals = [10, 20, 30, 40, 100];
  assert.equal(percentile(vals, 50), 30);
  assert.equal(percentile(vals, 95), 100);
});

test('stddevActiveChats', () => {
  assert.equal(stddevActiveChats([2, 2, 2]), 0);
  const sd = stddevActiveChats([0, 4]);
  assert.ok(sd > 0);
});
