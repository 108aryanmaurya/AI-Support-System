import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../services/api.js'
import {
  CONVERSATION_FILTER_CACHE_MS,
  FILTER_REFETCH_DEBOUNCE_MS,
  INBOX_AI_INTENT_OPTIONS,
} from '../config/inboxFilters.js'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback.js'
import { conversationCountsUrl, conversationsListUrl } from '../services/inboxApi.js'
import { useInboxStore } from '../stores/inboxStore.js'

/**
 * Conversation list fetch + sidebar filter switching (shared by Inbox and Search layouts).
 *
 * @param {string} organizationId
 * @param {{ setLoadingConversations: (v: boolean) => void, setError: (msg: string) => void, silentFilterRefetch?: boolean }} handlers
 */
export function useInboxSidebarActions(organizationId, handlers) {
  const { setLoadingConversations, setError, silentFilterRefetch = false } = handlers

  const setConversationsPage = useInboxStore((state) => state.setConversationsPage)
  const setActiveFilter = useInboxStore((state) => state.setActiveFilter)
  const setFilterCounts = useInboxStore((state) => state.setFilterCounts)
  const cacheConversationFilterPage = useInboxStore((state) => state.cacheConversationFilterPage)

  const activeFilter = useInboxStore((state) => state.activeFilter)
  const activeTagId = useInboxStore((state) => state.activeTagId)
  const setActiveTagId = useInboxStore((state) => state.setActiveTagId)
  const activeAiIntent = useInboxStore((state) => state.activeAiIntent)
  const setActiveAiIntent = useInboxStore((state) => state.setActiveAiIntent)
  const filterCounts = useInboxStore((state) => state.filterCounts)
  const autoAssignOnSelect = useInboxStore((state) => state.autoAssignOnSelect)
  const setAutoAssignOnSelect = useInboxStore((state) => state.setAutoAssignOnSelect)

  const runConversationQuery = useCallback(
    async (filterType, opts = {}) => {
      const silent = opts.silent === true
      if (!organizationId) return
      if (!silent) setLoadingConversations(true)
      if (!silent) setError('')
      try {
        const { activeTagId: tagId, activeAiIntent: aiIntent, conversationPagination } =
          useInboxStore.getState()
        const page = opts.page ?? conversationPagination.page ?? 1
        const pageSize = opts.pageSize ?? conversationPagination.pageSize ?? 50
        const response = await apiFetch(
          conversationsListUrl(organizationId, filterType, {
            page,
            pageSize,
            tagId: tagId || undefined,
            aiIntent: filterType === 'ai_intent' ? aiIntent || undefined : undefined,
          }),
        )
        setConversationsPage({
          items: response?.items ?? [],
          pagination: response?.pagination,
        })
        cacheConversationFilterPage(filterType, {
          items: response?.items ?? [],
          pagination: response?.pagination,
        })
      } catch (err) {
        if (!silent) setError(err?.message || 'Failed to load conversations.')
      } finally {
        if (!silent) setLoadingConversations(false)
      }
    },
    [organizationId, setLoadingConversations, setError, setConversationsPage, cacheConversationFilterPage],
  )

  const loadFilterCounts = useCallback(async () => {
    if (!organizationId) return
    try {
      const counts = await apiFetch(conversationCountsUrl(organizationId))
      setFilterCounts(counts)
    } catch {
      /* counts are best-effort */
    }
  }, [organizationId, setFilterCounts])

  const mentionsNotifyEpoch = useInboxStore((state) => state.mentionsNotifyEpoch)
  const [mentionCue, setMentionCue] = useState(false)

  useEffect(() => {
    if (mentionsNotifyEpoch === 0) return undefined
    const tOn = window.setTimeout(() => setMentionCue(true), 0)
    const tOff = window.setTimeout(() => setMentionCue(false), 1600)
    return () => {
      clearTimeout(tOn)
      clearTimeout(tOff)
    }
  }, [mentionsNotifyEpoch])

  const debouncedRefetchFilter = useDebouncedCallback((filterType) => {
    void (async () => {
      const silent = silentFilterRefetch === true
      await runConversationQuery(filterType, { silent })
      await loadFilterCounts()
    })()
  }, FILTER_REFETCH_DEBOUNCE_MS)

  const onSelectSidebarFilter = useCallback(
    (filterType) => {
      setActiveFilter(filterType)
      if (filterType === 'ai_intent' && !useInboxStore.getState().activeAiIntent) {
        setActiveAiIntent(INBOX_AI_INTENT_OPTIONS[0]?.value ?? 'general_inquiry')
      }
      const cached = useInboxStore.getState().conversationFilterCache[filterType]
      const fresh = cached && Date.now() - cached.fetchedAt < CONVERSATION_FILTER_CACHE_MS
      if (fresh) {
        setConversationsPage({
          items: cached.items,
          pagination: cached.pagination,
        })
      }
      debouncedRefetchFilter(filterType)
    },
    [setActiveFilter, setActiveAiIntent, setConversationsPage, debouncedRefetchFilter],
  )

  const onAiIntentFilterChange = useCallback(
    (intent) => {
      setActiveAiIntent(intent || null)
      const filter = useInboxStore.getState().activeFilter
      if (filter === 'ai_intent') {
        void runConversationQuery(filter)
      }
    },
    [setActiveAiIntent, runConversationQuery],
  )

  const onTagFilterChange = useCallback(
    (tagId) => {
      setActiveTagId(tagId || null)
      const filter = useInboxStore.getState().activeFilter
      void runConversationQuery(filter)
    },
    [setActiveTagId, runConversationQuery],
  )

  return {
    runConversationQuery,
    loadFilterCounts,
    onSelectSidebarFilter,
    onTagFilterChange,
    mentionCue,
    activeFilter,
    activeTagId,
    activeAiIntent,
    onAiIntentFilterChange,
    filterCounts,
    autoAssignOnSelect,
    setAutoAssignOnSelect,
  }
}
