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
  isConversationAssignmentType,
  isConversationPriority,
  isConversationStatus,
} from './conversationWorkspace.js';

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

export { SUPPORT_EVENT_TYPES, isSupportEventType } from './supportEventTypes.js';

export { AUTOMATION_JOB_TYPES, isAutomationJobType } from './automationJobTypes.js';

export {
  ORG_AI_MODEL_TIERS,
  ORG_AI_SETTINGS_DEFAULTS,
  ORG_AUTOMATION_SETTINGS_DEFAULTS,
  mergeOrgAiSettings,
  mergeOrgAutomationSettings,
} from './orgSettings.js';
