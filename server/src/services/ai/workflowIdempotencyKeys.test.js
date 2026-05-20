import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  workflowInboundIdempotencyKey,
  workflowSlaWarningIdempotencyKey,
  workflowTagAddedIdempotencyKey,
} from '@ai-support/shared';

describe('workflow idempotency keys', () => {
  it('builds stable inbound keys per org+message', () => {
    const key = workflowInboundIdempotencyKey('org-1', 'msg-1');
    assert.equal(key, 'workflow:inbound:org-1:msg-1');
  });

  it('builds tag and sla keys', () => {
    assert.equal(
      workflowTagAddedIdempotencyKey('org', 'conv', 'tag'),
      'workflow:tag:org:conv:tag',
    );
    assert.equal(workflowSlaWarningIdempotencyKey('org', '2026-05-20'), 'workflow:sla:org:2026-05-20');
  });
});
