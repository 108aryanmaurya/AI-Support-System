import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLifecycleSettingsPatch } from './lifecycleSettingsPatch.js';

describe('buildLifecycleSettingsPatch', () => {
  it('whitelists boolean toggles', () => {
    assert.deepEqual(
      buildLifecycleSettingsPatch({
        enabled: true,
        reopen_on_customer_message: false,
        unknown: true,
      }),
      { enabled: true, reopen_on_customer_message: false },
    );
  });

  it('clamps day fields to limits', () => {
    const patch = buildLifecycleSettingsPatch({
      resolved_auto_close_days: 14,
      waiting_reminder_days: 0,
      waiting_auto_close_after_reminder_days: 9999,
    });
    assert.equal(patch.resolved_auto_close_days, 14);
    assert.equal(patch.waiting_reminder_days, undefined);
    assert.equal(patch.waiting_auto_close_after_reminder_days, undefined);
  });

  it('returns empty object for invalid body', () => {
    assert.deepEqual(buildLifecycleSettingsPatch(null), {});
    assert.deepEqual(buildLifecycleSettingsPatch('x'), {});
  });
});
