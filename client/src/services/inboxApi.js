/**
 * Build URLs for inbox conversation APIs (`/api/org/:orgId/conversations/*`).
 */

function orgBase(organizationId) {
  return `/api/org/${encodeURIComponent(organizationId)}`;
}

export function conversationsListUrl(organizationId, filterType, options = {}) {
  const { page = 1, pageSize = 50, includeSpam = false, tagId = null, aiIntent = null } = options;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    filter: filterType,
  });
  if (includeSpam) params.set('includeSpam', 'true');
  if (tagId) params.set('tagId', tagId);
  if (aiIntent) params.set('aiIntent', aiIntent);
  return `${orgBase(organizationId)}/conversations?${params}`;
}

export function conversationCountsUrl(organizationId) {
  return `${orgBase(organizationId)}/conversations/counts`;
}

export function conversationMembersUrl(organizationId) {
  return `${orgBase(organizationId)}/conversations/members`;
}

/** PATCH assignment, status, priority, assignmentType, aiEnabled, tagIds. */
export function patchConversationUrl(organizationId, conversationId) {
  return `${orgBase(organizationId)}/conversations/${encodeURIComponent(conversationId)}`;
}

/** PATCH spam soft-flag (`is_spam`), never deletes. */
export function patchConversationSpamUrl(organizationId, conversationId) {
  return `${orgBase(organizationId)}/conversations/${encodeURIComponent(conversationId)}/spam`;
}

/** GET messages thread for a conversation (pagination query params). */
export function conversationMessagesUrl(organizationId, conversationId, options = {}) {
  const { page = 1, pageSize = 100 } = options;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return `${orgBase(organizationId)}/conversations/${encodeURIComponent(conversationId)}/messages?${params}`;
}
