import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hashIngressContent,
  normalizeIngressContent,
  scoreInboundSpam,
} from './ingressHeuristics.js';

describe('ingressHeuristics', () => {
  it('normalizes and hashes consistently', () => {
    const a = normalizeIngressContent('  Hello   World ');
    const b = normalizeIngressContent('hello world');
    assert.equal(a, b);
    assert.equal(hashIngressContent(a), hashIngressContent(b));
  });

  it('flags spam on blocklist + links', () => {
    const out = scoreInboundSpam({
      message: 'WINNER click here https://a.com https://b.com https://c.com',
      blocklist: ['winner'],
    });
    assert.equal(out.isSpam, true);
    assert.ok(out.signals.length >= 2);
  });

  it('allows normal support text', () => {
    const out = scoreInboundSpam({
      message: 'Hi, I need help resetting my password for account 1234.',
    });
    assert.equal(out.isSpam, false);
  });
});
