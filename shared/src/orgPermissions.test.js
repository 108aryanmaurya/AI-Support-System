import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasOrgPermission,
  mergeOrgPermissions,
  permissionsForRole,
} from './orgPermissions.js';

describe('permissionsForRole', () => {
  it('ADMIN has assign_others and mark_spam', () => {
    const p = permissionsForRole('ADMIN');
    assert.equal(hasOrgPermission(p, 'conversations.assign_others'), true);
    assert.equal(hasOrgPermission(p, 'conversations.mark_spam'), true);
    assert.equal(hasOrgPermission(p, 'team.invite'), true);
  });

  it('AGENT defaults deny assign_others and mark_spam', () => {
    const p = permissionsForRole('AGENT');
    assert.equal(hasOrgPermission(p, 'conversations.assign_others'), false);
    assert.equal(hasOrgPermission(p, 'conversations.mark_spam'), false);
    assert.equal(hasOrgPermission(p, 'conversations.assign_self'), true);
    assert.equal(hasOrgPermission(p, 'ai.use_copilot'), true);
  });
});

describe('mergeOrgPermissions', () => {
  it('merges org overrides onto role preset', () => {
    const base = permissionsForRole('AGENT');
    const merged = mergeOrgPermissions(
      { conversations: { mark_spam: true } },
      base,
    );
    assert.equal(hasOrgPermission(merged, 'conversations.mark_spam'), true);
    assert.equal(hasOrgPermission(merged, 'conversations.assign_others'), false);
  });
});
