/**
 * Shared constants and runtime values used by client and server.
 */

export const API_PREFIX = '/api';

export { MESSAGE_SENDER_TYPES, isMessageSenderType } from './messageSenderTypes.js';

export {
  CONVERSATION_ACTIVE_STATUSES,
  CONVERSATION_ASSIGNMENT_TYPES,
  CONVERSATION_PRIORITIES,
  CONVERSATION_STATUSES,
  CONVERSATION_WORKSPACE_STATUSES,
  isConversationAssignmentType,
  isConversationPriority,
  isConversationStatus,
} from './conversationWorkspace.js';

export {
  CONVERSATION_WAITING_STATUSES,
  CONVERSATION_WAITING_STATUS_NONE,
  getConversationWaitingStatus,
  isConversationWaitingStatus,
  normalizeConversationWaitingStatus,
} from './conversationWaitingStatus.js';

export {
  extractMentionHandles,
  mentionHandlesForMember,
  primaryMentionHandle,
  resolveMentionUserIdsFromContent,
} from './mentions.js';

export {
  compareConversationsInbox,
  inboxSortTier,
  lastMessageMs,
  sortConversationsInbox,
} from './inboxSort.js';

export {
  mergeConversationRecords,
  normalizeConversationRecord,
  pickAssignedMemberId,
} from './conversationRecord.js';

export { SUPPORT_EVENT_TYPES, isSupportEventType } from './supportEventTypes.js';

export {
  AUTOMATION_JOB_TYPES,
  LIFECYCLE_AUTOMATION_JOB_TYPES,
  isAutomationJobType,
} from './automationJobTypes.js';

export {
  WORKFLOW_AUTOMATION_JOB_TYPES,
  isWorkflowAutomationJobType,
} from './workflowAutomationJobTypes.js';

export {
  CONVERSATION_METADATA_AI_KEYS,
  hasConversationMetadataAi,
  parseConversationMetadataAi,
} from './conversationMetadataAi.js';

export {
  autoRouteIdempotencyKey,
  autoRouteDailyBackstopIdempotencyKey,
  unassignedScanOrgIdempotencyKey,
  utcCalendarDayKey,
  reassignIdempotencyKey,
  fifteenMinuteBucketKey,
  slaScanOrgIdempotencyKey,
  lifecycleScanOrgIdempotencyKey,
  lifecycleAutoCloseResolvedIdempotencyKey,
  lifecycleAutoCloseWaitingIdempotencyKey,
  lifecycleCustomerReminderIdempotencyKey,
  workflowInboundIdempotencyKey,
  workflowScheduleScanIdempotencyKey,
  workflowSlaWarningIdempotencyKey,
  workflowSlaNextResponseIdempotencyKey,
  slaBreachNotifyIdempotencyKey,
  workflowTagAddedIdempotencyKey,
} from './workflowIdempotencyKeys.js';

export {
  WORKFLOW_SCHEDULE_DEFAULTS,
  isValidWorkflowTimeHHMM,
  mergeWorkflowSchedule,
} from './workflowSchedule.js';

export { getConversationAutomationBadges } from './conversationAutomationBadges.js';

export {
  getConversationLifecycleDetailHint,
  getConversationLifecycleListBadges,
  isReopenedConversation,
} from './conversationLifecycleBadges.js';

export { buildLifecycleSettingsPatch } from './lifecycleSettingsPatch.js';

export {
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_CONDITION_FIELDS,
  WORKFLOW_CONDITION_OPS,
  WORKFLOW_RULES_LIMITS,
  WORKFLOW_TRIGGERS,
  mergeOrgWorkflowSettings,
  validateWorkflowRule,
  validateWorkflowRules,
  isWorkflowTrigger,
} from './workflowRules.js';

export { AI_FEATURES, isAiFeature } from './aiFeatures.js';

export {
  AI_FEEDBACK_ACTIONS,
  COMPOSER_REWRITE_TONES,
  SUGGEST_REPLY_LENGTHS,
  SUGGEST_REPLY_TONES,
  SUMMARY_TYPES,
  isAiFeedbackAction,
} from './aiCopilot.js';

export {
  CLASSIFICATION_INTENTS,
  CLASSIFICATION_SENTIMENTS,
  isClassificationIntent,
  isClassificationSentiment,
} from './aiClassification.js';

export {
  ORG_AI_MODEL_TIERS,
  ORG_AI_SETTINGS_DEFAULTS,
  ORG_AUTOMATION_SETTINGS_DEFAULTS,
  mergeOrgAiSettings,
  mergeOrgAutomationSettings,
} from './orgSettings.js';

export {
  AGENT_PRESENCE_ASSIGNABLE,
  AGENT_PRESENCE_HEARTBEAT_STATES,
  AGENT_PRESENCE_STATES,
  AGENT_ROUTING_STATUSES,
  ASSIGNMENT_LIMITS,
  ASSIGNMENT_LOG_REASONS,
  ASSIGNMENT_PRESENCE_DEFAULTS,
  ASSIGNMENT_STRATEGIES,
  defaultAgentProfileRow,
  isAgentPresenceHeartbeatState,
  isAgentPresenceState,
  isAgentRoutingStatus,
  isAssignmentLogReason,
  isAssignmentStrategy,
  isPresenceAssignable,
  normalizeAgentTimezone,
  normalizeMaxConcurrency,
  normalizeShiftTime,
  validateAgentSkillsPayload,
} from './assignment.js';

export { isWithinAgentShift } from './agentShiftHours.js';

export {
  ASSIGNMENT_ADVANCED_DEFAULTS,
  conversationMatchesVipTags,
  mergeAssignmentAdvancedSettings,
} from './assignmentAdvanced.js';

export {
  applySlaUrgentRanking,
  isSlaRemainingUrgent,
} from './assignmentSlaBoost.js';

export {
  ASSIGNMENT_INBOX_LIMITS,
  ORG_ASSIGNMENT_ROUTING_DEFAULTS,
  mergeOrgAssignmentRouting,
  parseConversationMetadataAssignment,
} from './assignmentInboxes.js';

export {
  ELIGIBILITY_DROP_CODES,
  SKILL_MATCH_TIERS,
  computeSkillMatchTier,
  isSkillMatchEligible,
} from './assignmentSkillMatch.js';

export {
  ASSIGNMENT_SCORE_WEIGHTS,
  SKILL_TIER_FACTORS,
  computeCustomerHistoryFactor,
  computeLowWorkloadFactor,
  computePriorityBonusFactor,
  computeRecentActivityFactor,
  computeSlaPerformanceFactor,
  computeStrategyScore,
  computeWeightedHybridScore,
  normalizeAssignmentStrategy,
  skillTierToFactor,
} from './assignmentScoring.js';

export {
  ORG_ASSIGNMENT_ORG_DEFAULTS,
  ORG_ASSIGNMENT_SETTINGS_DEFAULTS,
  isOrgAutoRouteEnabled,
  mergeOrgAssignmentSettings,
} from './assignmentSettings.js';

export { buildAssignmentSettingsPatch } from './assignmentSettingsPatch.js';

export {
  CONVERSATION_CLOSED_REASONS,
  CONVERSATION_TERMINAL_STATUSES,
  LIFECYCLE_LIMITS,
  ORG_LIFECYCLE_SETTINGS_DEFAULTS,
  isConversationClosedReason,
  isConversationTerminalStatus,
  isOrgLifecycleEnabled,
  mergeOrgLifecycleSettings,
  mergeOrgLifecycleSettingsFromOrg,
} from './lifecycleSettings.js';

export { percentile, stddevActiveChats } from './assignmentMetricsMath.js';

export {
  INGRESS_DUPLICATE_ACTIONS,
  INGRESS_SPAM_ACTIONS,
  ORG_INGRESS_POLICY_DEFAULTS,
  mergeOrgIngressPolicy,
} from './ingressPolicy.js';

export {
  ORG_PERMISSIONS_ADMIN_DEFAULTS,
  ORG_PERMISSIONS_AGENT_DEFAULTS,
  hasAllOrgPermissions,
  hasOrgPermission,
  mergeOrgPermissions,
  permissionsForRole,
} from './orgPermissions.js';

export {
  DEFAULT_INBOX_NAME,
  INBOX_LIMITS,
  INBOX_MEMBER_ROLES,
  INBOX_STATUSES,
  isInboxMemberRole,
  isInboxStatus,
  mergeInboxSettings,
  mergeOrgInboxSettings,
  slugifyInboxName,
} from './inboxes.js';

export {
  KNOWLEDGE_ALLOWED_UPLOAD_EXTENSIONS,
  KNOWLEDGE_ALLOWED_UPLOAD_MIMES,
  KNOWLEDGE_MAX_UPLOAD_BYTES,
  isAllowedKnowledgeUploadMime,
} from './knowledgeIngest.js';

export {
  KNOWLEDGE_ARTICLE_STATUSES,
  KNOWLEDGE_ARTICLE_VISIBILITIES,
  KNOWLEDGE_MAX_CHUNKS_PER_VERSION,
  KNOWLEDGE_MAX_CONTENT_LENGTH,
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  isKnowledgeArticleStatus,
  isKnowledgeArticleVisibility,
  isValidKnowledgeSlug,
  normalizeKnowledgeSlug,
} from './knowledgeArticle.js';
