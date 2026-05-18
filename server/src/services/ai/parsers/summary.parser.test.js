import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../../../utils/httpError.js';
import { parseSummarizeResponse } from './summary.parser.js';

test('parseSummarizeResponse detailed shape', () => {
  const raw = JSON.stringify({
    summary: {
      issue: 'Login failure',
      actions_taken: ['Reset link sent'],
      current_status: 'Waiting on customer',
    },
  });
  const parsed = parseSummarizeResponse(raw, 'detailed');
  assert.equal(parsed.summary.issue, 'Login failure');
  assert.deepEqual(parsed.summary.actions_taken, ['Reset link sent']);
});

test('parseSummarizeResponse timeline requires events', () => {
  assert.throws(() => parseSummarizeResponse('{"summary":{}}', 'timeline'), (err) => {
    assert.ok(err instanceof HttpError);
    return true;
  });
});
