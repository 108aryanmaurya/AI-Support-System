import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAssignmentAdvancedSettings } from './assignmentAdvanced.js';

test('mergeAssignmentAdvancedSettings enables reassignment by default', () => {
  const merged = mergeAssignmentAdvancedSettings({
    reassign_enabled: false,
    sla_routing_enabled: true,
    vip_routing_enabled: true,
  });
  assert.equal(merged.reassign_enabled, true);
  assert.equal(merged.reassign_on_agent_offline, true);
  assert.equal('sla_routing_enabled' in merged, false);
  assert.equal('vip_routing_enabled' in merged, false);
});
