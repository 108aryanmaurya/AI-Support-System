import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONVERSATION_CLOSED_REASONS,
  ORG_LIFECYCLE_SETTINGS_DEFAULTS,
  isConversationClosedReason,
  isConversationTerminalStatus,
  isOrgLifecycleEnabled,
  mergeOrgLifecycleSettings,
  mergeOrgLifecycleSettingsFromOrg,
} from './lifecycleSettings.js';

describe('mergeOrgLifecycleSettings', () => {
  it('returns defaults when raw is missing', () => {
    assert.deepEqual(mergeOrgLifecycleSettings(undefined), {
      ...ORG_LIFECYCLE_SETTINGS_DEFAULTS,
    });
  });

  it('merges partial lifecycle settings', () => {
    assert.deepEqual(mergeOrgLifecycleSettings({ enabled: true, resolved_auto_close_days: 30 }), {
      ...ORG_LIFECYCLE_SETTINGS_DEFAULTS,
      enabled: true,
      resolved_auto_close_days: 30,
    });
  });

  it('clamps invalid day values to defaults', () => {
    assert.equal(mergeOrgLifecycleSettings({ resolved_auto_close_days: 0 }).resolved_auto_close_days, 14);
    assert.equal(mergeOrgLifecycleSettings({ resolved_auto_close_days: 9999 }).resolved_auto_close_days, 14);
  });

  it('mergeOrgLifecycleSettingsFromOrg reads nested lifecycle', () => {
    assert.equal(
      mergeOrgLifecycleSettingsFromOrg({ lifecycle: { waiting_reminder_days: 5 } }).waiting_reminder_days,
      5,
    );
  });

  it('isOrgLifecycleEnabled reflects merged flag', () => {
    assert.equal(isOrgLifecycleEnabled(null), false);
    assert.equal(isOrgLifecycleEnabled({ enabled: true }), true);
    assert.equal(isOrgLifecycleEnabled({ lifecycle: { enabled: true } }), true);
  });
});

describe('lifecycle enums', () => {
  it('closed reasons are exhaustive for helpers', () => {
    for (const reason of CONVERSATION_CLOSED_REASONS) {
      assert.equal(isConversationClosedReason(reason), true);
    }
    assert.equal(isConversationClosedReason('magic'), false);
  });

  it('terminal statuses', () => {
    assert.equal(isConversationTerminalStatus('resolved'), true);
    assert.equal(isConversationTerminalStatus('closed'), true);
    assert.equal(isConversationTerminalStatus('open'), false);
  });
});
