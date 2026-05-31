/**
 * Per-inbox member capabilities stored in `inbox_members.permissions` (JSONB).
 * Mirrors invite-time configuration UI (Permissions and roles).
 */

export const INBOX_MEMBER_PERMISSION_ROLES = Object.freeze(['none', 'member', 'lead']);

export const COPILOT_USAGE_MODES = Object.freeze(['off', 'included', 'unlimited']);

export const CONVERSATION_ACCESS_MODES = Object.freeze([
  'all',
  'assigned_to_me',
  'assigned_to_my_teams',
  'all_except_teams',
  'mentions_only',
]);

/** @returns {object} */
export function defaultInboxMemberPermissions() {
  return {
    role: 'member',
    copilot: { usage: 'unlimited' },
    conversationAccess: { mode: 'all', exceptTeamIds: [] },
    settings: {
      manageGeneralSecurity: true,
      manageTeammatesSeatsPermissions: true,
      editOwnProfile: true,
      editOthersProfiles: true,
      manageTeams: true,
      changeStatus: true,
      manageMessenger: true,
      manageBilling: true,
      manageUsageAlerts: true,
      manageHardLimits: true,
      manageProactiveSupport: true,
      editSenderDomain: true,
    },
    dataAndSecurity: {
      manageWorkspaceData: true,
      accessPeopleCompaniesAccounts: true,
      accessLeadUserProfiles: true,
      exportLeadUserCompanyData: true,
      importContactsCompaniesTickets: true,
      manageTags: true,
      viewAllTeammateTeamDetails: true,
    },
    appsAndIntegrations: {
      accessDeveloperHub: true,
      installConfigureDeleteApps: true,
      triggerDataConnectorActions: true,
    },
    knowledge: {
      createManageKnowledgeContent: true,
      createUpdateDraftArticles: true,
      managePublishHelpCenterArticles: true,
      manageSavedViewsArticles: true,
    },
    automation: {
      viewFinAutomationSettings: true,
      manageAutomationInboundWorkflows: true,
      manageOutboundWorkflows: true,
    },
    outbound: {
      bulkMessageVisitorsLeadsUsers: true,
      publishNews: true,
      sendOutboundFromCustomAddresses: true,
      exportProactiveSupportData: true,
      setProductToursTooltipsChecklistsLive: true,
      setSurveysLive: true,
      manageSurveysData: true,
    },
    inbox: {
      createConversations: true,
      reassignConversationsEditOwnership: true,
      reassignConversationsWhenAway: true,
      manageConversationParticipants: true,
      mergeConversations: true,
      enableUndoSendDelay: true,
      deleteReplies: true,
      deleteNotes: true,
      removeSla: true,
      exportTranscripts: true,
      changeTicketType: true,
      editNotes: true,
      manageViews: true,
      manageBalancedAssignmentWorkload: true,
      manageRoundRobinAssignment: true,
      manageTeammatePresence: true,
      manageRules: true,
      manageAutoAwayMode: true,
      listenOnCalls: true,
      deleteCallRecordings: true,
      manageSharedMacros: true,
      createMacros: true,
      editMacros: true,
      deleteMacros: true,
      usePersonalMacros: true,
    },
    reports: {
      accessReports: true,
      deleteReports: true,
      createEditShareReports: true,
      scheduleDownloadPdf: true,
      exportCsv: true,
      accessChartDrillIn: true,
      manageWorkspaceFolders: true,
    },
  };
}

const BOOL_SECTIONS = [
  'settings',
  'dataAndSecurity',
  'appsAndIntegrations',
  'knowledge',
  'automation',
  'outbound',
  'inbox',
  'reports',
];

/**
 * @param {unknown} raw
 */
export function mergeInboxMemberPermissions(raw) {
  const defaults = defaultInboxMemberPermissions();
  if (!raw || typeof raw !== 'object') return defaults;
  const src = /** @type {Record<string, unknown>} */ (raw);

  const role =
    typeof src.role === 'string' && INBOX_MEMBER_PERMISSION_ROLES.includes(src.role)
      ? src.role
      : defaults.role;

  const copilotSrc = src.copilot && typeof src.copilot === 'object' ? src.copilot : {};
  const usage =
    typeof copilotSrc.usage === 'string' && COPILOT_USAGE_MODES.includes(copilotSrc.usage)
      ? copilotSrc.usage
      : defaults.copilot.usage;

  const convSrc =
    src.conversationAccess && typeof src.conversationAccess === 'object'
      ? src.conversationAccess
      : {};
  const mode =
    typeof convSrc.mode === 'string' && CONVERSATION_ACCESS_MODES.includes(convSrc.mode)
      ? convSrc.mode
      : defaults.conversationAccess.mode;
  const exceptTeamIds = Array.isArray(convSrc.exceptTeamIds)
    ? convSrc.exceptTeamIds.filter((id) => typeof id === 'string').slice(0, 32)
    : [];

  const merged = {
    role,
    copilot: { usage },
    conversationAccess: { mode, exceptTeamIds },
  };

  for (const section of BOOL_SECTIONS) {
    const defSection = defaults[section];
    const srcSection = src[section] && typeof src[section] === 'object' ? src[section] : {};
    /** @type {Record<string, boolean>} */
    const out = {};
    for (const key of Object.keys(defSection)) {
      out[key] = typeof srcSection[key] === 'boolean' ? srcSection[key] : defSection[key];
    }
    merged[section] = out;
  }

  return merged;
}

/**
 * @param {object} permissions — merged
 */
export function restrictAllInboxMemberPermissions(permissions) {
  const base = defaultInboxMemberPermissions();
  const restricted = mergeInboxMemberPermissions(permissions);
  restricted.role = 'none';
  restricted.copilot.usage = 'off';
  restricted.conversationAccess.mode = 'mentions_only';
  for (const section of BOOL_SECTIONS) {
    for (const key of Object.keys(base[section])) {
      restricted[section][key] = false;
    }
  }
  return restricted;
}

/**
 * Restore full capability defaults (preserves member/lead role when set).
 * @param {unknown} [permissions]
 */
/**
 * Inbox capability flags for assignment method (round robin vs balanced workload).
 * @param {unknown} [permissions]
 * @param {'manual' | 'round_robin' | 'balanced'} assignmentMethod
 */
export function applyInboxAssignmentMethodToMemberPermissions(permissions, assignmentMethod) {
  const merged = mergeInboxMemberPermissions(permissions);
  const method = assignmentMethod === 'round_robin' || assignmentMethod === 'balanced' ? assignmentMethod : 'manual';
  merged.inbox.manageRoundRobinAssignment = method === 'round_robin';
  merged.inbox.manageBalancedAssignmentWorkload = method === 'balanced';
  return merged;
}

/**
 * Default member permissions for an inbox using the given assignment method.
 * @param {'manual' | 'round_robin' | 'balanced'} assignmentMethod
 */
export function defaultInboxMemberPermissionsForAssignmentMethod(assignmentMethod) {
  return applyInboxAssignmentMethodToMemberPermissions(defaultInboxMemberPermissions(), assignmentMethod);
}

export function allowAllInboxMemberPermissions(permissions) {
  const next = defaultInboxMemberPermissions();
  const current = mergeInboxMemberPermissions(permissions);
  if (current.role === 'lead' || current.role === 'member') {
    next.role = current.role;
  }
  return next;
}

/**
 * True when permissions match the "restrict all" preset (all capability flags off).
 * @param {unknown} permissions
 */
export function isInboxMemberPermissionsRestricted(permissions) {
  const p = mergeInboxMemberPermissions(permissions);
  if (p.copilot.usage !== 'off') return false;
  if (p.conversationAccess.mode !== 'mentions_only') return false;
  for (const section of BOOL_SECTIONS) {
    if (!allBoolsFalse(p[section])) return false;
  }
  return true;
}

/**
 * @param {Record<string, boolean>} section
 */
function allBoolsTrue(section) {
  const keys = Object.keys(section);
  return keys.length > 0 && keys.every((k) => section[k] === true);
}

/**
 * @param {Record<string, boolean>} section
 */
function allBoolsFalse(section) {
  const keys = Object.keys(section);
  return keys.length > 0 && keys.every((k) => section[k] === false);
}

/**
 * Summary badge for a permission section row.
 * @param {string} sectionId
 * @param {object} permissions — merged
 */
export function inboxPermissionSectionSummary(sectionId, permissions) {
  const p = mergeInboxMemberPermissions(permissions);
  switch (sectionId) {
    case 'copilot':
      if (p.copilot.usage === 'off') return 'Off';
      if (p.copilot.usage === 'included') return 'Included usage';
      return 'Unlimited usage';
    case 'conversationAccess': {
      const labels = {
        all: 'All conversations',
        assigned_to_me: 'Assigned to them only',
        assigned_to_my_teams: 'Assigned to their teams only',
        all_except_teams: 'All except selected teams',
        mentions_only: 'Mentions and links only',
      };
      return labels[p.conversationAccess.mode] ?? 'Custom';
    }
    case 'settings':
    case 'dataAndSecurity':
    case 'appsAndIntegrations':
    case 'knowledge':
    case 'automation':
    case 'outbound':
    case 'inbox':
    case 'reports':
      return allBoolsTrue(p[sectionId]) ? 'All permissions' : allBoolsFalse(p[sectionId]) ? 'Restricted' : 'Custom';
    default:
      return 'Custom';
  }
}

/** UI section metadata for permissions editor. */
export const INBOX_PERMISSION_UI_SECTIONS = Object.freeze([
  { id: 'copilot', title: 'Copilot', type: 'copilot' },
  { id: 'conversationAccess', title: 'Conversation access', type: 'conversationAccess' },
  { id: 'settings', title: 'Settings', type: 'booleans' },
  { id: 'dataAndSecurity', title: 'Data and security', type: 'booleans' },
  { id: 'appsAndIntegrations', title: 'Apps and Integrations', type: 'booleans' },
  { id: 'knowledge', title: 'Knowledge', type: 'booleans' },
  { id: 'automation', title: 'Automation', type: 'booleans' },
  { id: 'outbound', title: 'Outbound', type: 'booleans' },
  { id: 'inbox', title: 'Inbox', type: 'inbox' },
  { id: 'reports', title: 'Reports', type: 'reports' },
]);

/** Human labels for boolean permission keys per section. */
export const INBOX_PERMISSION_FIELD_LABELS = Object.freeze({
  settings: {
    manageGeneralSecurity: 'Can manage general and security settings',
    manageTeammatesSeatsPermissions: 'Can manage teammates, seats and permissions',
    editOwnProfile: 'Can edit own profile',
    editOthersProfiles: "Can edit other teammates' profiles",
    manageTeams: 'Can manage teams',
    changeStatus: 'Can change status',
    manageMessenger: 'Can manage Messenger settings',
    manageBilling: 'Can manage Billing settings',
    manageUsageAlerts: 'Can manage usage alerts',
    manageHardLimits: 'Can manage hard limits',
    manageProactiveSupport: 'Can manage Proactive Support settings',
    editSenderDomain: 'Can edit sender domain',
  },
  dataAndSecurity: {
    manageWorkspaceData: 'Can manage workspace data',
    accessPeopleCompaniesAccounts: 'Can access people, companies, and account lists',
    accessLeadUserProfiles: 'Can access lead and user profile pages',
    exportLeadUserCompanyData: 'Can export Lead, User, Company data',
    importContactsCompaniesTickets: 'Can import contacts, companies and tickets',
    manageTags: 'Can manage tags',
    viewAllTeammateTeamDetails: 'Can view all teammate and team details',
  },
  appsAndIntegrations: {
    accessDeveloperHub: 'Can access Developer Hub',
    installConfigureDeleteApps: 'Can install, configure and delete apps',
    triggerDataConnectorActions: 'Can trigger data connector actions',
  },
  knowledge: {
    createManageKnowledgeContent: 'Can create and manage content in Knowledge',
    createUpdateDraftArticles: 'Can create and update draft Help Center articles',
    managePublishHelpCenterArticles: 'Can manage and publish Help Center articles',
    manageSavedViewsArticles: 'Can manage saved views for Help Center articles',
  },
  automation: {
    viewFinAutomationSettings: 'Can view Fin and Automation settings',
    manageAutomationInboundWorkflows: 'Can manage Automation settings and inbound Workflows',
    manageOutboundWorkflows: 'Can manage outbound Workflows',
  },
  outbound: {
    bulkMessageVisitorsLeadsUsers: 'Can bulk message visitors, leads and users',
    publishNews: 'Can publish News',
    sendOutboundFromCustomAddresses: 'Can send outbound emails from custom addresses',
    exportProactiveSupportData: 'Can export Proactive Support data',
    setProductToursTooltipsChecklistsLive: 'Can set Product Tours, Tooltips and Checklists live',
    setSurveysLive: 'Can set Surveys live',
    manageSurveysData: 'Can manage Surveys data',
  },
  inbox: {
    createConversations: 'Can create conversations',
    reassignConversationsEditOwnership: 'Can reassign conversations and edit lead or user ownership',
    reassignConversationsWhenAway: 'Can reassign conversations when going away',
    manageConversationParticipants: 'Can manage conversation participants',
    mergeConversations: 'Can merge conversations',
    enableUndoSendDelay: 'Can enable undo send delay',
    deleteReplies: 'Can delete replies from a conversation',
    deleteNotes: 'Can delete notes from a conversation',
    removeSla: 'Can remove SLA from conversations',
    exportTranscripts: 'Can export conversation transcripts',
    changeTicketType: 'Can change ticket type',
    editNotes: 'Can edit notes',
    manageViews: 'Can manage Views',
    manageBalancedAssignmentWorkload: 'Can manage Balanced assignment and Workload management',
    manageRoundRobinAssignment: 'Can manage Round Robin assignment',
    manageTeammatePresence: 'Can manage teammate presence',
    manageRules: 'Can manage Rules',
    manageAutoAwayMode: 'Can manage Auto Away mode',
    listenOnCalls: 'Can listen on calls',
    deleteCallRecordings: 'Can delete call recordings',
    manageSharedMacros: 'Can manage shared Macros',
    createMacros: 'Can create Macros',
    editMacros: 'Can edit Macros',
    deleteMacros: 'Can delete Macros',
    usePersonalMacros: 'Can use personal macros',
  },
  reports: {
    accessReports: 'Can access Reports',
    deleteReports: 'Can delete Reports',
    createEditShareReports: 'Can create, edit and internally share Reports',
    scheduleDownloadPdf: 'Can schedule and download PDFs of Reports',
    exportCsv: 'Can export CSV',
    accessChartDrillIn: 'Can access Chart drill-in',
    manageWorkspaceFolders: 'Can manage Workspace folders',
  },
});

/** Grouped inbox permission keys for UI layout. */
export const INBOX_PERMISSION_INBOX_GROUPS = Object.freeze([
  {
    title: 'Conversations',
    keys: [
      'createConversations',
      'reassignConversationsEditOwnership',
      'reassignConversationsWhenAway',
      'manageConversationParticipants',
      'mergeConversations',
      'enableUndoSendDelay',
      'deleteReplies',
      'deleteNotes',
      'removeSla',
      'exportTranscripts',
      'changeTicketType',
      'editNotes',
    ],
  },
  { title: 'Views', keys: ['manageViews'] },
  {
    title: 'Workload Management',
    keys: [
      'manageBalancedAssignmentWorkload',
      'manageRoundRobinAssignment',
      'manageTeammatePresence',
      'manageRules',
      'manageAutoAwayMode',
    ],
  },
  { title: 'Phone', keys: ['listenOnCalls', 'deleteCallRecordings'] },
  {
    title: 'Macros',
    keys: ['manageSharedMacros', 'createMacros', 'editMacros', 'deleteMacros', 'usePersonalMacros'],
  },
]);

/** Reports keys with parent/child nesting in UI. */
export const INBOX_PERMISSION_REPORTS_TREE = Object.freeze([
  { key: 'accessReports', children: ['deleteReports', 'createEditShareReports', 'scheduleDownloadPdf', 'exportCsv', 'accessChartDrillIn', 'manageWorkspaceFolders'] },
]);
