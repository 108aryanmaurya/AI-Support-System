import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../services/api.js'
import { CONVERSATION_FILTER_CACHE_MS, FILTER_REFETCH_DEBOUNCE_MS } from '../config/inboxFilters.js'
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
        const response = await apiFetch(conversationsListUrl(organizationId, filterType))
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
    [setActiveFilter, setConversationsPage, debouncedRefetchFilter],
  )

  return {
    runConversationQuery,
    loadFilterCounts,
    onSelectSidebarFilter,
    mentionCue,
    activeFilter,
    filterCounts,
    autoAssignOnSelect,
    setAutoAssignOnSelect,
  }
}
