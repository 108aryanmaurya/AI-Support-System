import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseConversationMetadataAi } from '@ai-support/shared';

describe('parseConversationMetadataAi', () => {
  it('returns null when metadata.ai is missing', () => {
    assert.equal(parseConversationMetadataAi({}), null);
    assert.equal(parseConversationMetadataAi(null), null);
  });

  it('normalizes classification fields for Phase 4 conditions', () => {
    const out = parseConversationMetadataAi({
      mentions: ['@agent'],
      ai: {
        intent: 'billing_issue',
        sentiment: 'frustrated',
        sentiment_score: 1.5,
        language: 'en',
        auto_tags: ['Refund', ''],
        classified_at: '2026-05-20T12:00:00.000Z',
        classified_message_id: 'msg-1',
        run_id: 'run-1',
      },
    });

    assert.ok(out);
    assert.equal(out.intent, 'billing_issue');
    assert.equal(out.sentiment, 'frustrated');
    assert.equal(out.sentiment_score, 1);
    assert.equal(out.language, 'en');
    assert.deepEqual(out.auto_tags, ['refund']);
  });

  it('rejects unknown intent/sentiment enums', () => {
    const out = parseConversationMetadataAi({
      ai: { intent: 'not_real', sentiment: 'mad', auto_tags: [] },
    });
    assert.ok(out);
    assert.equal(out.intent, null);
    assert.equal(out.sentiment, null);
  });
});
