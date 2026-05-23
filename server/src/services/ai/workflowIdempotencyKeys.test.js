import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  autoRouteIdempotencyKey,
  fifteenMinuteBucketKey,
  slaScanOrgIdempotencyKey,
  workflowInboundIdempotencyKey,
  workflowSlaWarningIdempotencyKey,
  workflowTagAddedIdempotencyKey,
} from '@ai-support/shared';

describe('workflow idempotency keys', () => {
  it('builds stable inbound keys per org+message', () => {
    const key = workflowInboundIdempotencyKey('org-1', 'msg-1');
    assert.equal(key, 'workflow:inbound:org-1:msg-1');
  });

  it('builds 15-minute SLA scan bucket and org keys', () => {
    const at = new Date('2026-05-23T14:37:00.000Z');
    assert.equal(fifteenMinuteBucketKey(at), '2026-05-23T14:30');
    assert.equal(
      slaScanOrgIdempotencyKey('org-1', '2026-05-23T14:30'),
      'sla.scan:org-1:2026-05-23T14:30',
    );
  });

  it('builds auto-route key per org+conversation+message', () => {
    assert.equal(
      autoRouteIdempotencyKey('org', 'conv', 'msg'),
      'assignment:auto_route:org:conv:msg',
    );
  });

  it('builds tag and sla keys', () => {
    assert.equal(
      workflowTagAddedIdempotencyKey('org', 'conv', 'tag'),
      'workflow:tag:org:conv:tag',
    );
    assert.equal(
      workflowSlaWarningIdempotencyKey('org', 'conv', '2026-05-20'),
      'workflow:sla:org:conv:2026-05-20',
    );
  });
});
