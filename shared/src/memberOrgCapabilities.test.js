import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultInboxMemberPermissions } from './inboxMemberPermissions.js';
import { deriveOrgCapabilitiesFromMemberPermissions } from './memberOrgCapabilities.js';
import { hasOrgPermission } from './orgPermissions.js';

test('deriveOrgCapabilitiesFromMemberPermissions respects restricted member', () => {
  const restricted = defaultInboxMemberPermissions();
  restricted.settings.manageTeammatesSeatsPermissions = false;
  restricted.inbox.reassignConversationsEditOwnership = false;
  restricted.inbox.createConversations = false;
  restricted.reports.accessReports = false;
  restricted.copilot.usage = 'off';

  const caps = deriveOrgCapabilitiesFromMemberPermissions(restricted);
  assert.equal(hasOrgPermission(caps, 'team.invite'), false);
  assert.equal(hasOrgPermission(caps, 'conversations.assign_others'), false);
  assert.equal(hasOrgPermission(caps, 'ai.use_copilot'), false);
});

test('deriveOrgCapabilitiesFromMemberPermissions grants admin-like member', () => {
  const caps = deriveOrgCapabilitiesFromMemberPermissions(defaultInboxMemberPermissions());
  assert.equal(hasOrgPermission(caps, 'team.invite'), true);
  assert.equal(hasOrgPermission(caps, 'conversations.assign_others'), true);
  assert.equal(hasOrgPermission(caps, 'analytics.view_org'), true);
});
