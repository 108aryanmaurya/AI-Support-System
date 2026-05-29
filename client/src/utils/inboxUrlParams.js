import { INBOX_AI_INTENT_OPTIONS, INBOX_SIDEBAR_FILTERS } from '../config/inboxFilters.js'
import { DEFAULT_INBOX_FILTER } from '../stores/inboxStore.js'

const VALID_FILTER_IDS = new Set(INBOX_SIDEBAR_FILTERS.map((f) => f.id))
const VALID_AI_INTENTS = new Set(INBOX_AI_INTENT_OPTIONS.map((o) => o.value))

export const DEFAULT_INBOX_PAGE = 1
export const DEFAULT_INBOX_PAGE_SIZE = 50
export const MAX_INBOX_PAGE_SIZE = 100

function parsePositiveInt(raw, fallback, { min = 1, max = Infinity } = {}) {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Parse inbox list + thread params from the location search string.
 * @param {URLSearchParams} searchParams
 */
export function parseInboxListParams(searchParams) {
  const filterRaw = searchParams.get('filter')?.trim() ?? ''
  const filter = VALID_FILTER_IDS.has(filterRaw) ? filterRaw : DEFAULT_INBOX_FILTER

  const page = parsePositiveInt(searchParams.get('page'), DEFAULT_INBOX_PAGE)
  const pageSize = parsePositiveInt(searchParams.get('pageSize'), DEFAULT_INBOX_PAGE_SIZE, {
    min: 1,
    max: MAX_INBOX_PAGE_SIZE,
  })

  const tagId = searchParams.get('tagId')?.trim() || null
  const aiIntentRaw = searchParams.get('aiIntent')?.trim() ?? ''
  let aiIntent = VALID_AI_INTENTS.has(aiIntentRaw) ? aiIntentRaw : null
  if (filter === 'ai_intent' && !aiIntent) {
    aiIntent = INBOX_AI_INTENT_OPTIONS[0]?.value ?? 'general_inquiry'
  }

  const conversation = searchParams.get('conversation')?.trim() ?? ''

  return { filter, page, pageSize, tagId, aiIntent, conversation }
}

/** True once `filter` is present (defaults have been written or user navigated with query). */
export function inboxListParamsReady(searchParams) {
  const raw = searchParams.get('filter')?.trim() ?? ''
  return VALID_FILTER_IDS.has(raw)
}

/**
 * Merge list/thread params into URLSearchParams (preserves unrelated keys).
 * @param {URLSearchParams} existing
 * @param {Partial<{ filter: string, page: number, pageSize: number, tagId: string | null, aiIntent: string | null, conversation: string | null }>} updates
 */
export function mergeInboxSearchParams(existing, updates = {}) {
  const merged = { ...parseInboxListParams(existing), ...updates }
  const next = new URLSearchParams(existing)

  next.set('filter', merged.filter)
  next.set('page', String(merged.page))
  next.set('pageSize', String(merged.pageSize))

  if (merged.tagId) next.set('tagId', merged.tagId)
  else next.delete('tagId')

  if (merged.filter === 'ai_intent' && merged.aiIntent) {
    next.set('aiIntent', merged.aiIntent)
  } else {
    next.delete('aiIntent')
  }

  if (merged.conversation) next.set('conversation', merged.conversation)
  else next.delete('conversation')

  return next
}
