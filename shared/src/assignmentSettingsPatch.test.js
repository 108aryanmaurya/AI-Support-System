import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssignmentSettingsPatch } from './assignmentSettingsPatch.js';

test('buildAssignmentSettingsPatch whitelists known keys', () => {
  const patch = buildAssignmentSettingsPatch({
    strategy: 'least_loaded',
    unknown_key: 'x',
    sla_routing_enabled: true,
    vip_tag_names: ['vip'],
    fallback_notify_member_ids: ['uuid-1'],
  });
  assert.equal(patch.strategy, undefined);
  assert.equal(patch.unknown_key, undefined);
  assert.equal(patch.sla_routing_enabled, undefined);
  assert.equal(patch.vip_tag_names, undefined);
  assert.deepEqual(patch.fallback_notify_member_ids, ['uuid-1']);
});

test('buildAssignmentSettingsPatch persists empty fallback_notify_member_ids', () => {
  const patch = buildAssignmentSettingsPatch({
    fallback_notify_member_ids: [],
  });
  assert.deepEqual(patch.fallback_notify_member_ids, []);
});

test('buildAssignmentSettingsPatch accepts routing preferences', () => {
  const patch = buildAssignmentSettingsPatch({
    default_assignee: { type: 'inbox', inboxId: 'inbox-1' },
    self_assign_on_reply: 'keep_queue',
  });
  assert.deepEqual(patch.default_assignee, { type: 'inbox', inboxId: 'inbox-1' });
  assert.equal(patch.self_assign_on_reply, 'keep_queue');
});
