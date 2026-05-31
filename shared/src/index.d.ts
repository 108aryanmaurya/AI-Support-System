export const API_PREFIX: string;

export const MESSAGE_SENDER_TYPES: readonly ['customer', 'agent', 'system', 'ai', 'internal_note'];

export function isMessageSenderType(
  value: unknown,
): value is 'customer' | 'agent' | 'system' | 'ai' | 'internal_note';

export const CONVERSATION_STATUSES: readonly [
  'open',
  'pending',
  'resolved',
  'closed',
  'spam',
];
export const CONVERSATION_WORKSPACE_STATUSES: readonly ['open', 'pending', 'spam'];
export const CONVERSATION_PRIORITIES: readonly ['low', 'medium', 'high', 'urgent'];
export const CONVERSATION_ASSIGNMENT_TYPES: readonly [
  'unassigned',
  'assigned_to_agent',
  'assigned_to_team',
  'assigned_to_ai',
];
export const CONVERSATION_ACTIVE_STATUSES: readonly ['open', 'pending'];

export function isConversationStatus(value: unknown): value is (typeof CONVERSATION_STATUSES)[number];
export function isConversationPriority(value: unknown): value is (typeof CONVERSATION_PRIORITIES)[number];
export function isConversationAssignmentType(
  value: unknown,
): value is (typeof CONVERSATION_ASSIGNMENT_TYPES)[number];

export interface MentionMemberInput {
  userId: string;
  displayName?: string | null;
  email?: string | null;
}

export function extractMentionHandles(content: string): string[];
export function mentionHandlesForMember(member: MentionMemberInput): Set<string>;
export function resolveMentionUserIdsFromContent(
  content: string,
  members: MentionMemberInput[],
): string[];

export function lastMessageMs(conversation: unknown): number;
export function inboxSortTier(conversation: unknown, myMemberId: string | null | undefined): 0 | 1 | 2;
export function compareConversationsInbox(a: unknown, b: unknown, myMemberId: string | null | undefined): number;
export function sortConversationsInbox(items: unknown[], myMemberId: string | null | undefined): unknown[];

export function normalizeConversationRecord(raw: unknown): unknown;
export function mergeConversationRecords(prev: unknown, incoming: unknown): unknown;
export function pickAssignedMemberId(raw: unknown): string | null;

export const SUPPORT_EVENT_TYPES: readonly [
  'message.inbound',
  'message.outbound_sent',
  'message.outbound_failed',
  'conversation.created',
  'conversation.closed',
  'conversation.reopened',
  'conversation.assigned',
  'conversation.priority_changed',
  'member.first_response',
  'sla.first_response_breach',
  'knowledge.search',
  'knowledge.article_viewed',
  'knowledge.article_published',
  'knowledge.ingest_completed',
  'knowledge.ingest_failed',
];

export function isSupportEventType(value: unknown): value is (typeof SUPPORT_EVENT_TYPES)[number];

export const AUTOMATION_JOB_TYPES: readonly [
  'notify.staff_inbound',
  'notify.sla_warning',
  'notify.assignment',
  'sla.scan_org',
  'knowledge.ingest_source',
  'ai.classify_inbound',
  'assignment.auto_route',
  'ai.workflow_inbound',
  'ai.workflow_tag_added',
  'ai.workflow_sla',
  'ai.workflow_schedule_org',
];

export function isAutomationJobType(value: unknown): value is (typeof AUTOMATION_JOB_TYPES)[number];

export const AI_FEATURES: readonly [
  'assist',
  'suggest_reply',
  'summarize',
  'translate',
  'rewrite',
  'classify',
  'rag_ask',
  'auto_reply',
];

export function isAiFeature(value: unknown): value is (typeof AI_FEATURES)[number];

export const SUGGEST_REPLY_TONES: readonly ['professional', 'friendly', 'empathetic', 'concise'];
export const SUGGEST_REPLY_LENGTHS: readonly ['short', 'medium', 'long'];
export const SUMMARY_TYPES: readonly ['short', 'detailed', 'timeline'];

export const ORG_AI_SETTINGS_DEFAULTS: {
  ai_enabled: boolean;
  assist_enabled: boolean;
  auto_tag_enabled: boolean;
  auto_route_to_ai: boolean;
  workflow_automation_enabled: boolean;
  autonomous_replies_enabled: boolean;
  default_conversation_ai_enabled: boolean;
  model_tier: string;
};

export const ORG_AI_MODEL_TIERS: readonly ['standard', 'advanced'];

export const ORG_AUTOMATION_SETTINGS_DEFAULTS: {
  inbound_notify_enabled: boolean;
  assignment_notify_enabled: boolean;
  sla_enabled: boolean;
  first_response_sla_minutes: number;
  next_response_sla_minutes: number;
};

export function mergeOrgAiSettings(raw: unknown): typeof ORG_AI_SETTINGS_DEFAULTS;
export function mergeOrgAutomationSettings(raw: unknown): typeof ORG_AUTOMATION_SETTINGS_DEFAULTS;

export const ASSIGNMENT_STRATEGIES: readonly [
  'weighted_hybrid',
  'least_loaded',
  'round_robin',
];

export const AGENT_ROUTING_STATUSES: readonly ['active', 'inactive'];
export const AGENT_PRESENCE_STATES: readonly [
  'online',
  'available',
  'away',
  'busy',
  'offline',
];
export const AGENT_PRESENCE_HEARTBEAT_STATES: readonly [
  'online',
  'available',
  'away',
  'busy',
];
export const AGENT_PRESENCE_ASSIGNABLE: readonly ['online', 'available'];
export const ASSIGNMENT_PRESENCE_DEFAULTS: {
  presenceTtlSec: number;
  heartbeatIntervalMs: number;
};
export function isAgentPresenceHeartbeatState(value: unknown): boolean;
export function isPresenceAssignable(presence: unknown): boolean;
export function isWithinAgentShift(
  profile: {
    shiftStart?: string | null;
    shiftEnd?: string | null;
    shift_start?: string | null;
    shift_end?: string | null;
    timezone?: string;
  },
  at?: Date,
): boolean;
export const ASSIGNMENT_LOG_REASONS: readonly [
  'manual',
  'workflow',
  'auto_route',
  'unassign',
  'system',
];
export const ASSIGNMENT_LIMITS: {
  minConcurrency: number;
  maxConcurrency: number;
  defaultConcurrency: number;
  maxTimezoneLength: number;
};

export function isAssignmentStrategy(value: unknown): boolean;
export function isAgentRoutingStatus(value: unknown): boolean;
export function isAgentPresenceState(value: unknown): boolean;
export function isAssignmentLogReason(value: unknown): boolean;
export function normalizeShiftTime(raw: unknown): string | null;
export function normalizeAgentTimezone(raw: unknown): string;
export function normalizeMaxConcurrency(raw: unknown): number;
export function defaultAgentProfileRow(): {
  status: string;
  max_concurrency: number;
  shift_start: null;
  shift_end: null;
  timezone: string;
};

export const ORG_ASSIGNMENT_ORG_DEFAULTS: {
  default_max_concurrency: number;
  default_shift_start: string | null;
  default_shift_end: string | null;
  default_timezone: string;
  fallback_notify_member_ids: readonly string[];
};

export const ORG_ASSIGNMENT_SETTINGS_DEFAULTS: typeof ORG_ASSIGNMENT_ORG_DEFAULTS;

export function mergeOrgAssignmentSettings(
  raw: unknown,
): {
  default_max_concurrency: number;
  default_shift_start: string | null;
  default_shift_end: string | null;
  default_timezone: string;
  fallback_notify_member_ids: string[];
};
export function isOrgAutoRouteEnabled(settings: unknown): boolean;

export const CONVERSATION_CLOSED_REASONS: readonly [
  'manual',
  'auto_idle_resolved',
  'auto_no_reply_after_reminder',
];
export const CONVERSATION_TERMINAL_STATUSES: readonly ['resolved', 'closed'];
export const LIFECYCLE_LIMITS: {
  readonly minDays: number;
  readonly maxResolvedAutoCloseDays: number;
  readonly maxWaitingDays: number;
  readonly maxNewConversationAfterClosedDays: number;
};
export const ORG_LIFECYCLE_SETTINGS_DEFAULTS: {
  readonly enabled: boolean;
  readonly resolved_auto_close_days: number;
  readonly waiting_reminder_days: number;
  readonly waiting_auto_close_after_reminder_days: number;
  readonly reopen_on_customer_message: boolean;
  readonly new_conversation_after_closed_days: number;
  readonly set_waiting_customer_on_agent_reply: boolean;
  readonly customer_reminder_enabled: boolean;
};
export function isConversationClosedReason(value: unknown): boolean;
export function isConversationTerminalStatus(value: unknown): boolean;
export function mergeOrgLifecycleSettings(
  raw: unknown,
): typeof ORG_LIFECYCLE_SETTINGS_DEFAULTS;
export function mergeOrgLifecycleSettingsFromOrg(
  orgSettings: unknown,
): typeof ORG_LIFECYCLE_SETTINGS_DEFAULTS;
export function isOrgLifecycleEnabled(settings: unknown): boolean;

export function autoRouteIdempotencyKey(
  organizationId: string,
  conversationId: string,
  messageId: string,
): string;

export const KNOWLEDGE_ARTICLE_STATUSES: readonly [
  'draft',
  'review_pending',
  'approved',
  'published',
  'archived',
];
export const KNOWLEDGE_ARTICLE_VISIBILITIES: readonly ['public', 'internal', 'restricted'];
export const KNOWLEDGE_SOURCE_TYPES: readonly ['manual', 'file'];
export const KNOWLEDGE_SOURCE_STATUSES: readonly [
  'pending',
  'processing',
  'processed',
  'failed',
  'retrying',
  'archived',
];
export const KNOWLEDGE_MAX_CONTENT_LENGTH: number;
export const KNOWLEDGE_MAX_CHUNKS_PER_VERSION: number;

export function isKnowledgeArticleStatus(value: unknown): boolean;
export function isKnowledgeArticleVisibility(value: unknown): boolean;
export function isValidKnowledgeSlug(slug: string): boolean;
export function normalizeKnowledgeSlug(title: string, explicitSlug?: string): string;

export const KNOWLEDGE_MAX_UPLOAD_BYTES: number;
export const KNOWLEDGE_ALLOWED_UPLOAD_MIMES: readonly string[];
export const KNOWLEDGE_ALLOWED_UPLOAD_EXTENSIONS: readonly string[];
export function isAllowedKnowledgeUploadMime(mime: string): boolean;

export const ORG_PERMISSIONS_AGENT_DEFAULTS: Readonly<
  Record<string, Readonly<Record<string, boolean>>>
>;
export const ORG_PERMISSIONS_ADMIN_DEFAULTS: Readonly<
  Record<string, Readonly<Record<string, boolean>>>
>;
export function mergeOrgPermissions(
  raw: unknown,
  roleDefaults?: typeof ORG_PERMISSIONS_AGENT_DEFAULTS,
): Record<string, Record<string, boolean>>;
export function permissionsForRole(
  role: 'ADMIN' | 'AGENT' | string | null | undefined,
): Record<string, Record<string, boolean>>;
export function hasOrgPermission(permissions: unknown, key: string): boolean;
export function hasAllOrgPermissions(permissions: unknown, keys: string[]): boolean;
