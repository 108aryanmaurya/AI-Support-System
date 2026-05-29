import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  autoRouteDailyBackstopIdempotencyKey,
  autoRouteIdempotencyKey,
  fifteenMinuteBucketKey,
  slaBreachNotifyIdempotencyKey,
  slaScanOrgIdempotencyKey,
  unassignedScanOrgIdempotencyKey,
  utcCalendarDayKey,
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
    assert.equal(
      autoRouteDailyBackstopIdempotencyKey('org', 'conv', '2026-05-23'),
      'assignment:auto_route_daily:org:conv:2026-05-23',
    );
  });

  it('builds daily unassigned scan keys', () => {
    const at = new Date('2026-05-23T14:37:00.000Z');
    assert.equal(utcCalendarDayKey(at), '2026-05-23');
    assert.equal(
      unassignedScanOrgIdempotencyKey('org-1', '2026-05-23'),
      'assignment:scan_unassigned:org-1:2026-05-23',
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
    assert.equal(
      slaBreachNotifyIdempotencyKey('org', 'conv', 'next_response', '2026-05-20'),
      'sla:breach_notify:org:conv:next_response:2026-05-20',
    );
  });
});
