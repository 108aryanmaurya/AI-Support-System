/**
 * Shared constants and runtime values used by client and server.
 */

export const API_PREFIX = '/api';

export {
  extractMentionHandles,
  mentionHandlesForMember,
  resolveMentionUserIdsFromContent,
} from './mentions.js';

export {
  compareConversationsInbox,
  inboxSortTier,
  lastMessageMs,
  sortConversationsInbox,
} from './inboxSort.js';
