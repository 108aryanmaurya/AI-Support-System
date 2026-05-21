import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateWorkflowRule, validateWorkflowRules } from '@ai-support/shared';

const validRule = {
  name: 'Escalate billing',
  trigger: 'inbound_message',
  conditions: {
    op: 'all',
    conditions: [{ field: 'intent', op: 'eq', value: 'billing_issue' }],
  },
  actions: [{ type: 'set_priority', priority: 'high' }],
};

describe('validateWorkflowRules', () => {
  it('accepts a minimal valid rule', () => {
    const out = validateWorkflowRule(validRule, 0);
    assert.equal(out.name, 'Escalate billing');
    assert.equal(out.actions[0].type, 'set_priority');
  });

  it('rejects invalid trigger', () => {
    assert.throws(() =>
      validateWorkflowRule({ ...validRule, trigger: 'on_click' }, 0),
    );
  });

  it('rejects too many actions', () => {
    const actions = Array.from({ length: 11 }, () => ({
      type: 'notify',
      channel: 'staff',
    }));
    assert.throws(() => validateWorkflowRule({ ...validRule, actions }, 0));
  });

  it('validates assign_to_ai action shape', () => {
    const out = validateWorkflowRule(
      { ...validRule, actions: [{ type: 'assign_to_ai' }] },
      0,
    );
    assert.equal(out.actions[0].type, 'assign_to_ai');
  });

  it('validates batch array', () => {
    assert.equal(validateWorkflowRules([validRule]).length, 1);
  });
});
