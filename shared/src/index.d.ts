export const API_PREFIX: string;

export const MESSAGE_SENDER_TYPES: readonly ['customer', 'agent', 'system', 'ai', 'internal_note'];

export function isMessageSenderType(
  value: unknown,
): value is 'customer' | 'agent' | 'system' | 'ai' | 'internal_note';

export const CONVERSATION_STATUSES: readonly [
  'open',
  'pending',
  'waiting_customer',
  'resolved',
  'closed',
  'spam',
];
export const CONVERSATION_PRIORITIES: readonly ['low', 'medium', 'high', 'urgent'];
export const CONVERSATION_ASSIGNMENT_TYPES: readonly [
  'unassigned',
  'assigned_to_agent',
  'assigned_to_team',
  'assigned_to_ai',
];
export const CONVERSATION_ACTIVE_STATUSES: readonly ['open', 'pending', 'waiting_customer'];

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
  'notify.assignment',
  'sla.scan_org',
  'knowledge.ingest_source',
  'ai.classify_inbound',
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
};

export function mergeOrgAiSettings(raw: unknown): typeof ORG_AI_SETTINGS_DEFAULTS;
export function mergeOrgAutomationSettings(raw: unknown): typeof ORG_AUTOMATION_SETTINGS_DEFAULTS;

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
