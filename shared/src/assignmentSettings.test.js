import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ASSIGNMENT_STRATEGIES,
  ORG_ASSIGNMENT_SETTINGS_DEFAULTS,
  isOrgAutoRouteEnabled,
  mergeOrgAssignmentSettings,
} from './assignmentSettings.js';

describe('mergeOrgAssignmentSettings', () => {
  it('returns defaults when raw is missing', () => {
    assert.deepEqual(mergeOrgAssignmentSettings(undefined), {
      ...ORG_ASSIGNMENT_SETTINGS_DEFAULTS,
    });
  });

  it('merges partial assignment settings', () => {
    assert.deepEqual(mergeOrgAssignmentSettings({ auto_route_enabled: true }), {
      auto_route_enabled: true,
      strategy: 'weighted_hybrid',
    });
  });

  it('rejects unknown strategy', () => {
    assert.equal(
      mergeOrgAssignmentSettings({ strategy: 'magic' }).strategy,
      ORG_ASSIGNMENT_SETTINGS_DEFAULTS.strategy,
    );
  });

  it('accepts known strategies', () => {
    for (const strategy of ASSIGNMENT_STRATEGIES) {
      assert.equal(mergeOrgAssignmentSettings({ strategy }).strategy, strategy);
    }
  });

  it('isOrgAutoRouteEnabled reflects merged flag', () => {
    assert.equal(isOrgAutoRouteEnabled(null), false);
    assert.equal(isOrgAutoRouteEnabled({ auto_route_enabled: true }), true);
  });
});
