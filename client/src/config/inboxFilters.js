/** Sidebar segments wired to GET /api/org/:orgId/conversations?filter=… */
export const INBOX_SIDEBAR_FILTERS = Object.freeze([
  { id: 'inbox', label: 'Your inbox' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'created_by_you', label: 'Created by you' },
  { id: 'all', label: 'All' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'spam', label: 'Spam' },
  { id: 'sla_risk', label: 'SLA risk' },
  { id: 'ingress_spam', label: 'Spam flagged' },
  { id: 'ai_intent', label: 'AI intent', requiresIntent: true },
  { id: 'waiting_agent', label: 'Waiting on agent' },
  { id: 'waiting_customer', label: 'Waiting on customer' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
])

/** Shown when `ai_intent` filter is active — must match server `isClassificationIntent`. */
export const INBOX_AI_INTENT_OPTIONS = Object.freeze([
  { value: 'billing_issue', label: 'Billing' },
  { value: 'refund_request', label: 'Refund' },
  { value: 'technical_support', label: 'Technical' },
  { value: 'shipping_delivery', label: 'Shipping' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'general_inquiry', label: 'General' },
  { value: 'other', label: 'Other' },
])

/** How long a cached first-page result stays fresh when switching filters (ms). */
export const CONVERSATION_FILTER_CACHE_MS = 45_000

/** Debounce rapid sidebar clicks before hitting the network (ms). */
export const FILTER_REFETCH_DEBOUNCE_MS = 300
