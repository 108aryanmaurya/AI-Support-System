import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ORG_ASSIGNMENT_ORG_DEFAULTS,
  isOrgAutoRouteEnabled,
  mergeOrgAssignmentSettings,
} from './assignmentSettings.js';

describe('mergeOrgAssignmentSettings', () => {
  it('returns org defaults when raw is missing', () => {
    assert.deepEqual(mergeOrgAssignmentSettings(undefined), {
      ...ORG_ASSIGNMENT_ORG_DEFAULTS,
      fallback_notify_member_ids: [],
    });
  });

  it('merges agent profile defaults', () => {
    assert.equal(
      mergeOrgAssignmentSettings({ default_max_concurrency: 8 }).default_max_concurrency,
      8,
    );
  });

  it('does not expose org scoring strategy', () => {
    const merged = mergeOrgAssignmentSettings({ strategy: 'weighted_hybrid' });
    assert.equal('strategy' in merged, false);
  });

  it('isOrgAutoRouteEnabled is always false (per-inbox auto-route)', () => {
    assert.equal(isOrgAutoRouteEnabled(null), false);
    assert.equal(isOrgAutoRouteEnabled({ auto_route_enabled: true }), false);
  });
});
