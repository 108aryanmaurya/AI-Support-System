import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conversationMatchesVipTags,
  mergeAssignmentAdvancedSettings,
} from './assignmentAdvanced.js';

test('mergeAssignmentAdvancedSettings clamps threshold', () => {
  const merged = mergeAssignmentAdvancedSettings({
    sla_remaining_minutes_threshold: 999,
    vip_tag_names: [' VIP '],
  });
  assert.equal(merged.sla_remaining_minutes_threshold, 120);
  assert.equal('vip_min_proficiency' in merged, false);
  assert.deepEqual(merged.vip_tag_names, ['vip']);
});

test('conversationMatchesVipTags', () => {
  assert.equal(conversationMatchesVipTags(['billing', 'vip'], ['vip', 'enterprise']), true);
  assert.equal(conversationMatchesVipTags(['billing'], ['vip']), false);
});
