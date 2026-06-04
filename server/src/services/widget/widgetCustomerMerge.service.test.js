import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emailsMatchForMerge,
  isSyntheticWidgetEmail,
} from './widgetCustomerMerge.service.js';

describe('widgetCustomerMerge helpers', () => {
  it('detects synthetic widget emails', () => {
    assert.equal(isSyntheticWidgetEmail('visitor+abc@widget.invalid'), true);
    assert.equal(isSyntheticWidgetEmail('real@example.com'), false);
  });

  it('matches real emails for merge', () => {
    assert.equal(emailsMatchForMerge('a@b.com', 'a@b.com'), true);
    assert.equal(emailsMatchForMerge('visitor+@widget.invalid', 'a@b.com'), false);
    assert.equal(emailsMatchForMerge(null, 'a@b.com'), false);
  });
});
