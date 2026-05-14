export const API_PREFIX: string;

export const MESSAGE_SENDER_TYPES: readonly ['customer', 'agent', 'system', 'ai', 'internal_note'];

export function isMessageSenderType(
  value: unknown,
): value is 'customer' | 'agent' | 'system' | 'ai' | 'internal_note';

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
