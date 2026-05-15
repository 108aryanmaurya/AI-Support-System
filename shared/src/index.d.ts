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
];

export function isSupportEventType(value: unknown): value is (typeof SUPPORT_EVENT_TYPES)[number];

/** Ticket entity shared between client and API */
export interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface Message {
  id: string;
  ticket_id: string;
  body: string;
  author_id: string;
  created_at: string;
  role: 'user' | 'agent' | 'system';
}
