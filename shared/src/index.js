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
  WORKFLOW_AUTOMATION_JOB_TYPES,
  isWorkflowAutomationJobType,
} from './workflowAutomationJobTypes.js';

export {
  CONVERSATION_METADATA_AI_KEYS,
  hasConversationMetadataAi,
  parseConversationMetadataAi,
} from './conversationMetadataAi.js';

export {
  workflowInboundIdempotencyKey,
  workflowSlaWarningIdempotencyKey,
  workflowTagAddedIdempotencyKey,
} from './workflowIdempotencyKeys.js';

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
