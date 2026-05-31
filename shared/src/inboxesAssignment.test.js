import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inboxScoringStrategyFromSettings,
  isDedicatedInboxAssignmentStrategy,
  isInboxAutoAssignmentEnabled,
  mergeInboxSettings,
} from './inboxes.js';
import {
  applyInboxAssignmentMethodToMemberPermissions,
  defaultInboxMemberPermissions,
} from './inboxMemberPermissions.js';

describe('inbox assignment method', () => {
  it('defaults to manual', () => {
    assert.equal(mergeInboxSettings({}).assignmentMethod, 'manual');
    assert.equal(isInboxAutoAssignmentEnabled(mergeInboxSettings({})), false);
    assert.equal(inboxScoringStrategyFromSettings(mergeInboxSettings({})), null);
  });

  it('maps round_robin to scoring strategy', () => {
    const s = mergeInboxSettings({ assignmentMethod: 'round_robin' });
    assert.equal(s.assignmentMethod, 'round_robin');
    assert.equal(inboxScoringStrategyFromSettings(s), 'round_robin');
  });

  it('maps balanced to least_loaded (fewest open conversations)', () => {
    const s = mergeInboxSettings({ assignmentMethod: 'balanced' });
    assert.equal(inboxScoringStrategyFromSettings(s), 'least_loaded');
    assert.equal(isDedicatedInboxAssignmentStrategy('least_loaded'), true);
  });

  it('round_robin is a dedicated inbox strategy', () => {
    assert.equal(isDedicatedInboxAssignmentStrategy('round_robin'), true);
    assert.equal(isDedicatedInboxAssignmentStrategy('weighted_hybrid'), false);
  });

  it('sets member permissions by method', () => {
    const manual = applyInboxAssignmentMethodToMemberPermissions(defaultInboxMemberPermissions(), 'manual');
    assert.equal(manual.inbox.manageRoundRobinAssignment, false);
    assert.equal(manual.inbox.manageBalancedAssignmentWorkload, false);

    const rr = applyInboxAssignmentMethodToMemberPermissions(defaultInboxMemberPermissions(), 'round_robin');
    assert.equal(rr.inbox.manageRoundRobinAssignment, true);
    assert.equal(rr.inbox.manageBalancedAssignmentWorkload, false);

    const bal = applyInboxAssignmentMethodToMemberPermissions(defaultInboxMemberPermissions(), 'balanced');
    assert.equal(bal.inbox.manageRoundRobinAssignment, false);
    assert.equal(bal.inbox.manageBalancedAssignmentWorkload, true);
  });
});
