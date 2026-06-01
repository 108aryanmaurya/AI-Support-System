import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasOrgPermission,
  mergeOrgPermissions,
  permissionsForRole,
  ORG_PERMISSIONS_ADMIN_DEFAULTS,
} from './orgPermissions.js';

describe('permissionsForRole', () => {
  it('returns full org access for any role label until member permissions are enforced', () => {
    for (const role of ['ADMIN', 'AGENT', 'Owner', 'Support Lead', null, undefined]) {
      const p = permissionsForRole(role);
      assert.equal(hasOrgPermission(p, 'conversations.assign_others'), true);
      assert.equal(hasOrgPermission(p, 'conversations.mark_spam'), true);
      assert.equal(hasOrgPermission(p, 'team.invite'), true);
    }
  });
});

describe('mergeOrgPermissions', () => {
  it('merges org overrides onto role preset', () => {
    const base = permissionsForRole('member');
    const merged = mergeOrgPermissions(
      { conversations: { mark_spam: false } },
      base,
    );
    assert.equal(hasOrgPermission(merged, 'conversations.mark_spam'), false);
    assert.equal(hasOrgPermission(merged, 'conversations.assign_others'), true);
  });

  it('admin defaults include export', () => {
    assert.equal(hasOrgPermission(ORG_PERMISSIONS_ADMIN_DEFAULTS, 'analytics.export'), true);
  });
});
