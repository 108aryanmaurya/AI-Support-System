/** Primary sidebar segments — wired to GET /api/org/:orgId/conversations?filter=… */
export const INBOX_SIDEBAR_FILTERS = Object.freeze([
  { id: 'inbox', label: 'Your inbox', icon: 'inbox' },
  { id: 'mentions', label: 'Mentions', icon: 'mentions' },
  { id: 'created_by', label: 'Created by', icon: 'created_by' },
  { id: 'unassigned', label: 'Unassigned', icon: 'unassigned' },
  { id: 'spam', label: 'Spam', icon: 'spam' },
])

/** Expandable sidebar sections (dropdown children set filter + query param). */
export const INBOX_SIDEBAR_SECTIONS = Object.freeze([
  { id: 'team_inboxes', label: 'Team inboxes', filter: 'team_inbox', param: 'inbox' },
  { id: 'teammates', label: 'Teammates', filter: 'teammate', param: 'memberId' },
  { id: 'views', label: 'Views', filter: 'channel', param: 'channelId' },
])

/** Legacy filter ids still accepted by the API for bookmarks. */
export const LEGACY_INBOX_FILTER_IDS = Object.freeze([
  'created_by_you',
  'all',
  'sla_risk',
  'ingress_spam',
  'ai_intent',
  'waiting_agent',
  'waiting_customer',
  'resolved',
  'closed',
])

/** How long a cached first-page result stays fresh when switching filters (ms). */
export const CONVERSATION_FILTER_CACHE_MS = 45_000

/** Debounce rapid sidebar clicks before hitting the network (ms). */
export const FILTER_REFETCH_DEBOUNCE_MS = 300
