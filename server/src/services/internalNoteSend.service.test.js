import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ORG_PERMISSIONS_AGENT_DEFAULTS } from '@ai-support/shared';
import { assertCanPostInternalNote } from './mentionNotification.service.js';
import { HttpError } from '../utils/httpError.js';

describe('assertCanPostInternalNote', () => {
  it('allows agents with messages.internal_note', () => {
    assert.doesNotThrow(() => assertCanPostInternalNote(ORG_PERMISSIONS_AGENT_DEFAULTS));
  });

  it('denies when permission missing', () => {
    const perms = {
      ...ORG_PERMISSIONS_AGENT_DEFAULTS,
      messages: { ...ORG_PERMISSIONS_AGENT_DEFAULTS.messages, internal_note: false },
    };
    assert.throws(() => assertCanPostInternalNote(perms), (e) => e instanceof HttpError && e.status === 403);
  });
});
