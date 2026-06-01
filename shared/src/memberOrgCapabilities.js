/**
 * Map `organization_members.permissions` (inbox-member shape) to org capability keys
 * used by {@link hasOrgPermission} (`team.invite`, `conversations.assign_others`, …).
 */

import { mergeInboxMemberPermissions } from './inboxMemberPermissions.js';
import { mergeOrgPermissions, ORG_PERMISSIONS_AGENT_DEFAULTS } from './orgPermissions.js';

function bool(v) {
  return v === true;
}

/**
 * @param {unknown} memberPermissions — raw or merged `organization_members.permissions`
 * @returns {ReturnType<typeof mergeOrgPermissions>}
 */
export function deriveOrgCapabilitiesFromMemberPermissions(memberPermissions) {
  const p = mergeInboxMemberPermissions(memberPermissions);
  const settings = p.settings ?? {};
  const inbox = p.inbox ?? {};
  const automation = p.automation ?? {};
  const reports = p.reports ?? {};
  const copilot = p.copilot ?? {};
  const accessMode =
    typeof p.conversationAccess?.mode === 'string' ? p.conversationAccess.mode : 'all';

  const copilotOn = copilot.usage !== 'off';
  const manageTeammates = bool(settings.manageTeammatesSeatsPermissions);
  const manageTeams = bool(settings.manageTeams);
  const assignOthers = bool(inbox.reassignConversationsEditOwnership);
  const assignSelf = assignOthers || bool(inbox.createConversations);
  const viewAllConversations = accessMode === 'all' || accessMode === 'all_except_teams';
  const mentionsOnly = accessMode === 'mentions_only';

  return mergeOrgPermissions(
    {
      conversations: {
        view_all: viewAllConversations,
        view_unassigned: !mentionsOnly,
        assign_self: assignSelf,
        assign_others: assignOthers,
        unassign: assignOthers,
        close: bool(inbox.createConversations),
        mark_spam: bool(inbox.manageRules),
        merge: bool(inbox.mergeConversations),
        transfer_inbox: assignOthers,
        view_all_inboxes: manageTeams,
      },
      inboxes: {
        manage:
          manageTeams ||
          bool(inbox.manageBalancedAssignmentWorkload) ||
          bool(inbox.manageRoundRobinAssignment),
      },
      messages: {
        reply: copilotOn && !mentionsOnly,
        internal_note: bool(inbox.editNotes),
        retry_failed: bool(inbox.createConversations),
      },
      ai: {
        use_copilot: copilotOn,
        manage_settings:
          bool(automation.viewFinAutomationSettings) ||
          bool(automation.manageAutomationInboundWorkflows),
        manage_workflows: bool(automation.manageAutomationInboundWorkflows),
        enable_autonomous: false,
      },
      automation: {
        manage_assignment:
          bool(inbox.manageBalancedAssignmentWorkload) ||
          bool(inbox.manageRoundRobinAssignment),
        manage_sla: bool(inbox.removeSla),
        view_logs: bool(automation.viewFinAutomationSettings),
      },
      team: {
        invite: manageTeammates,
        manage_members: manageTeammates,
        configure_permissions: manageTeammates,
      },
      analytics: {
        view_org: bool(reports.accessReports),
        view_self: bool(reports.accessReports) || assignSelf,
        export: bool(reports.exportCsv),
      },
      channels: {
        manage_email: bool(settings.editSenderDomain) || bool(settings.manageMessenger),
        manage_webhooks: bool(settings.manageGeneralSecurity),
      },
    },
    ORG_PERMISSIONS_AGENT_DEFAULTS,
  );
}
