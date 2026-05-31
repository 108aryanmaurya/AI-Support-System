import { useCallback, useEffect, useState } from 'react'
import {
  CONVERSATION_FILTER_CACHE_MS,
  FILTER_REFETCH_DEBOUNCE_MS,
} from '../config/inboxFilters.js'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback.js'
import { conversationCountsUrl, conversationsListUrl } from '../services/inboxApi.js'
import { useInboxStore } from '../stores/inboxStore.js'
import { apiFetch } from '../services/api.js'

/**
 * Build list API options from URL-driven inbox params.
 * @param {ReturnType<import('../utils/inboxUrlParams.js').parseInboxListParams>} params
 */
function listQueryOptionsFromParams(params) {
  const { filter, inbox, memberId, channelId } = params
  const opts = { page: params.page, pageSize: params.pageSize }
  if (filter === 'team_inbox' && inbox) opts.inboxId = inbox
  if (filter === 'teammate' && memberId) opts.memberId = memberId
  if (filter === 'channel' && channelId) opts.channelId = channelId
  return opts
}

/**
 * Conversation list fetch + sidebar filter switching (shared by Inbox and Search layouts).
 *
 * @param {string} organizationId
 * @param {{ setLoadingConversations: (v: boolean) => void, setError: (msg: string) => void, silentFilterRefetch?: boolean, listParams?: object }} handlers
 */
export function useInboxSidebarActions(organizationId, handlers) {
  const { setLoadingConversations, setError, silentFilterRefetch = false, listParams = null } =
    handlers

  const setConversationsPage = useInboxStore((state) => state.setConversationsPage)
  const setActiveFilter = useInboxStore((state) => state.setActiveFilter)
  const setFilterCounts = useInboxStore((state) => state.setFilterCounts)
  const cacheConversationFilterPage = useInboxStore((state) => state.cacheConversationFilterPage)

  const filterCounts = useInboxStore((state) => state.filterCounts)

  const runConversationQuery = useCallback(
    async (filterType, opts = {}) => {
      const silent = opts.silent === true
      if (!organizationId) return
      if (!silent) setLoadingConversations(true)
      if (!silent) setError('')
      try {
        const { conversationPagination } = useInboxStore.getState()
        const page = opts.page ?? conversationPagination.page ?? 1
        const pageSize = opts.pageSize ?? conversationPagination.pageSize ?? 50
        const urlParams = listParams ?? {
          filter: filterType,
          inbox: '',
          memberId: '',
          channelId: '',
          page,
          pageSize,
        }
        const response = await apiFetch(
          conversationsListUrl(organizationId, filterType, {
            page,
            pageSize,
            ...listQueryOptionsFromParams(urlParams),
          }),
        )
        setConversationsPage({
          items: response?.items ?? [],
          pagination: response?.pagination,
        })
        const cacheKey = `${filterType}|${urlParams.inbox}|${urlParams.memberId}|${urlParams.channelId}`
        cacheConversationFilterPage(cacheKey, {
          items: response?.items ?? [],
          pagination: response?.pagination,
        })
      } catch (err) {
        if (!silent) setError(err?.message || 'Failed to load conversations.')
      } finally {
        if (!silent) setLoadingConversations(false)
      }
    },
    [
      organizationId,
      listParams,
      setLoadingConversations,
      setError,
      setConversationsPage,
      cacheConversationFilterPage,
    ],
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

  const onSelectPrimaryFilter = useCallback(
    (filterType) => {
      setActiveFilter(filterType)
      const params = listParams ?? { filter: filterType, inbox: '', memberId: '', channelId: '' }
      const cacheKey = `${filterType}|${params.inbox}|${params.memberId}|${params.channelId}`
      const cached = useInboxStore.getState().conversationFilterCache[cacheKey]
      const fresh = cached && Date.now() - cached.fetchedAt < CONVERSATION_FILTER_CACHE_MS
      if (fresh) {
        setConversationsPage({
          items: cached.items,
          pagination: cached.pagination,
        })
      }
      debouncedRefetchFilter(filterType)
    },
    [setActiveFilter, listParams, setConversationsPage, debouncedRefetchFilter],
  )

  return {
    runConversationQuery,
    loadFilterCounts,
    onSelectPrimaryFilter,
    mentionCue,
    filterCounts,
  }
}
