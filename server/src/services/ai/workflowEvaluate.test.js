import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWorkflowEvalContext,
  evaluateConditionLeaf,
  evaluateConditionTree,
  evaluateWorkflowRules,
} from './workflowEvaluate.service.js';

const baseSignals = {
  conversationId: 'conv-1',
  ai_enabled: true,
  priority: 'medium',
  channel_id: 'ch-1',
  classification: {
    intent: 'billing_issue',
    sentiment: 'frustrated',
    sentiment_score: -0.4,
    language: 'en',
    auto_tags: ['refund'],
    classified_at: null,
    classified_message_id: null,
    run_id: null,
  },
};

describe('workflowEvaluate', () => {
  it('buildWorkflowEvalContext maps classification fields', () => {
    const ctx = buildWorkflowEvalContext({
      signals: baseSignals,
      trigger: 'inbound_message',
    });
    assert.equal(ctx.intent, 'billing_issue');
    assert.equal(ctx.sentiment, 'frustrated');
    assert.deepEqual(ctx.auto_tags, ['refund']);
  });

  it('evaluates all/any condition trees', () => {
    const ctx = buildWorkflowEvalContext({ signals: baseSignals, trigger: 'inbound_message' });
    assert.equal(
      evaluateConditionTree(
        {
          op: 'all',
          conditions: [
            { field: 'intent', op: 'eq', value: 'billing_issue' },
            { field: 'priority', op: 'ne', value: 'low' },
          ],
        },
        ctx,
      ),
      true,
    );
    assert.equal(
      evaluateConditionTree(
        {
          op: 'any',
          conditions: [
            { field: 'intent', op: 'eq', value: 'other' },
            { field: 'sentiment', op: 'eq', value: 'frustrated' },
          ],
        },
        ctx,
      ),
      true,
    );
  });

  it('evaluates auto_tag and business_hours leaves', () => {
    const ctx = buildWorkflowEvalContext({
      signals: baseSignals,
      trigger: 'inbound_message',
      isBusinessHours: false,
    });
    assert.equal(evaluateConditionLeaf({ field: 'auto_tag', op: 'eq', value: 'refund' }, ctx), true);
    assert.equal(
      evaluateConditionLeaf({ field: 'business_hours', op: 'eq', value: false }, ctx),
      true,
    );
  });

  it('matches rules by trigger and sort order', () => {
    const ctx = buildWorkflowEvalContext({ signals: baseSignals, trigger: 'inbound_message' });
    const rules = [
      {
        id: 'r2',
        name: 'Second',
        enabled: true,
        trigger: 'inbound_message',
        sortOrder: 2,
        conditions: { op: 'all', conditions: [{ field: 'intent', op: 'eq', value: 'billing_issue' }] },
        actions: [{ type: 'set_priority', priority: 'high' }],
      },
      {
        id: 'r1',
        name: 'First',
        enabled: true,
        trigger: 'inbound_message',
        sortOrder: 1,
        conditions: { op: 'all', conditions: [{ field: 'intent', op: 'eq', value: 'other' }] },
        actions: [{ type: 'notify', channel: 'staff' }],
      },
      {
        id: 'r3',
        name: 'Disabled',
        enabled: false,
        trigger: 'inbound_message',
        sortOrder: 0,
        conditions: { op: 'all', conditions: [{ field: 'intent', op: 'eq', value: 'billing_issue' }] },
        actions: [{ type: 'assign_to_ai' }],
      },
    ];

    const matched = evaluateWorkflowRules(rules, 'inbound_message', ctx);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].ruleId, 'r2');
    assert.equal(matched[0].actions[0].priority, 'high');
  });
});
