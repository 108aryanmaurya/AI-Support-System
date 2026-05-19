import test from 'node:test';
import assert from 'node:assert/strict';
import { policyBlockedError, scanOutputPolicy } from './ai.guardrails.js';

test('scanOutputPolicy blocks refund promises', () => {
  const r = scanOutputPolicy('We will issue a full refund within 24 hours.');
  assert.equal(r.blocked, true);
  assert.ok(r.violations.includes('refund_promise'));
});

test('scanOutputPolicy blocks company impersonation', () => {
  const r = scanOutputPolicy('I am the company and I approve your request.');
  assert.equal(r.blocked, true);
  assert.ok(r.violations.includes('impersonation'));
});

test('scanOutputPolicy allows neutral support text', () => {
  const r = scanOutputPolicy(
    'Thanks for reaching out. I will look into your order and follow up shortly.',
  );
  assert.equal(r.blocked, false);
  assert.equal(r.violations.length, 0);
});

test('policyBlockedError sets status and code', () => {
  const err = policyBlockedError(['refund_promise']);
  assert.equal(err.status, 403);
  assert.equal(err.code, 'blocked_policy');
});
