import {
  INBOX_SIDEBAR_FILTERS,
  LEGACY_INBOX_FILTER_IDS,
} from '../config/inboxFilters.js'

const PRIMARY_FILTER_IDS = new Set(INBOX_SIDEBAR_FILTERS.map((f) => f.id))
const VALID_FILTER_IDS = new Set([
  ...PRIMARY_FILTER_IDS,
  'team_inbox',
  'teammate',
  'channel',
  ...LEGACY_INBOX_FILTER_IDS,
])

export const DEFAULT_INBOX_FILTER = 'inbox'
export const DEFAULT_INBOX_PAGE = 1
export const DEFAULT_INBOX_PAGE_SIZE = 50
export const MAX_INBOX_PAGE_SIZE = 100

function parsePositiveInt(raw, fallback, { min = 1, max = Infinity } = {}) {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeFilterId(raw) {
  const f = raw.trim().toLowerCase().replace(/-/g, '_')
  if (f === 'created_by_you') return 'created_by'
  return f
}

/**
 * Parse inbox list + thread params from the location search string.
 * @param {URLSearchParams} searchParams
 */
export function parseInboxListParams(searchParams) {
  const filterRaw = searchParams.get('filter')?.trim() ?? ''
  const normalized = filterRaw ? normalizeFilterId(filterRaw) : ''
  const filter = VALID_FILTER_IDS.has(normalized) ? normalized : DEFAULT_INBOX_FILTER

  const page = parsePositiveInt(searchParams.get('page'), DEFAULT_INBOX_PAGE)
  const pageSize = parsePositiveInt(searchParams.get('pageSize'), DEFAULT_INBOX_PAGE_SIZE, {
    min: 1,
    max: MAX_INBOX_PAGE_SIZE,
  })

  const tagId = searchParams.get('tagId')?.trim() || null
  const conversation = searchParams.get('conversation')?.trim() ?? ''
  const inbox = searchParams.get('inbox')?.trim() || searchParams.get('inboxId')?.trim() || ''
  const memberId = searchParams.get('memberId')?.trim() || ''
  const channelId = searchParams.get('channelId')?.trim() || ''

  return { filter, page, pageSize, tagId, conversation, inbox, memberId, channelId }
}

/** True once `filter` is present (defaults have been written or user navigated with query). */
export function inboxListParamsReady(searchParams) {
  const raw = searchParams.get('filter')?.trim() ?? ''
  if (!raw) return false
  return VALID_FILTER_IDS.has(normalizeFilterId(raw))
}

/**
 * Merge list/thread params into URLSearchParams (preserves unrelated keys).
 * @param {URLSearchParams} existing
 * @param {Partial<{ filter: string, page: number, pageSize: number, tagId: string | null, conversation: string | null, inbox: string | null, memberId: string | null, channelId: string | null }>} updates
 */
export function mergeInboxSearchParams(existing, updates = {}) {
  const merged = { ...parseInboxListParams(existing), ...updates }
  const next = new URLSearchParams(existing)

  next.set('filter', merged.filter)
  next.set('page', String(merged.page))
  next.set('pageSize', String(merged.pageSize))

  if (merged.tagId) next.set('tagId', merged.tagId)
  else next.delete('tagId')

  if (merged.inbox) next.set('inbox', merged.inbox)
  else next.delete('inbox')
  next.delete('inboxId')

  if (merged.memberId) next.set('memberId', merged.memberId)
  else next.delete('memberId')

  if (merged.channelId) next.set('channelId', merged.channelId)
  else next.delete('channelId')

  next.delete('aiIntent')

  if (merged.conversation) next.set('conversation', merged.conversation)
  else next.delete('conversation')

  return next
}
