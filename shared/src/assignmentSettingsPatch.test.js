import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssignmentSettingsPatch } from './assignmentSettingsPatch.js';

test('buildAssignmentSettingsPatch whitelists known keys', () => {
  const patch = buildAssignmentSettingsPatch({
    auto_route_enabled: true,
    strategy: 'least_loaded',
    unknown_key: 'x',
    vip_tag_names: [' VIP '],
    fallback_notify_member_ids: ['uuid-1'],
  });
  assert.equal(patch.auto_route_enabled, true);
  assert.equal(patch.strategy, 'least_loaded');
  assert.equal(patch.unknown_key, undefined);
  assert.deepEqual(patch.vip_tag_names, ['vip']);
  assert.deepEqual(patch.fallback_notify_member_ids, ['uuid-1']);
});
