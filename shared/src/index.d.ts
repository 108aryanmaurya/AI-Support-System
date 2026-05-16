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
];

export function isSupportEventType(value: unknown): value is (typeof SUPPORT_EVENT_TYPES)[number];

export const AUTOMATION_JOB_TYPES: readonly [
  'notify.staff_inbound',
  'notify.assignment',
  'sla.scan_org',
];

export function isAutomationJobType(value: unknown): value is (typeof AUTOMATION_JOB_TYPES)[number];

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
