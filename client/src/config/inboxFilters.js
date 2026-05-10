/** Sidebar segments wired to GET /api/org/:orgId/conversations?filter=… */
export const INBOX_SIDEBAR_FILTERS = Object.freeze([
  { id: 'inbox', label: 'Your inbox' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'created_by_you', label: 'Created by you' },
  { id: 'all', label: 'All' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'spam', label: 'Spam' },
])

/** How long a cached first-page result stays fresh when switching filters (ms). */
export const CONVERSATION_FILTER_CACHE_MS = 45_000

/** Debounce rapid sidebar clicks before hitting the network (ms). */
export const FILTER_REFETCH_DEBOUNCE_MS = 300
