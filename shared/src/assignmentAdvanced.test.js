import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conversationMatchesVipTags,
  mergeAssignmentAdvancedSettings,
} from './assignmentAdvanced.js';

test('mergeAssignmentAdvancedSettings clamps threshold and vip proficiency', () => {
  const merged = mergeAssignmentAdvancedSettings({
    sla_remaining_minutes_threshold: 999,
    vip_min_proficiency: 200,
    vip_tag_names: [' VIP '],
  });
  assert.equal(merged.sla_remaining_minutes_threshold, 120);
  assert.equal(merged.vip_min_proficiency, 70);
  assert.deepEqual(merged.vip_tag_names, ['vip']);
});

test('conversationMatchesVipTags', () => {
  assert.equal(conversationMatchesVipTags(['billing', 'vip'], ['vip', 'enterprise']), true);
  assert.equal(conversationMatchesVipTags(['billing'], ['vip']), false);
});
