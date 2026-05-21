import { create } from 'zustand'
import { sortConversationsInbox } from '@ai-support/shared'

/** Hard cap for conversations kept in client memory (pagination / load-more trim). */
export const MAX_CONVERSATIONS_IN_MEMORY = 100

function getClientRequestId(message) {
  return message?.metadata?.client_request_id ?? message?.client_request_id ?? ''
}

/**
 * Drop overflow from a list already sorted by inbox rules (tier + last_message_at).
 * Keeps `pinnedConversationId` visible when possible (e.g. active thread).
 */
export function trimConversationsToCap(sortedInboxList, max, pinnedConversationId = '', myMemberId = null) {
  if (sortedInboxList.length <= max) return sortedInboxList
  if (!pinnedConversationId) return sortedInboxList.slice(0, max)

  const top = sortedInboxList.slice(0, max)
  if (top.some((c) => c.id === pinnedConversationId)) return top

  const pinned = sortedInboxList.find((c) => c.id === pinnedConversationId)
  if (!pinned) return sortedInboxList.slice(0, max)

  const rest = sortedInboxList.filter((c) => c.id !== pinned.id)
  return sortConversationsInbox([pinned, ...rest], myMemberId ?? null).slice(0, max)
}

/** Merge one conversation and full re-sort O(n log n) — keeps ordering rules with assignment changes. */
function mergeConversationInboxSort(list, incoming, myMemberId) {
  const id = incoming?.id
  if (!id) return list
  const without = list.filter((c) => c.id !== id)
  const prev = list.find((c) => c.id === id)
  const merged = prev ? { ...prev, ...incoming } : { ...incoming }
  return sortConversationsInbox([...without, merged], myMemberId ?? null)
}

function upsertMessage(list, incoming) {
  const clientRequestId = getClientRequestId(incoming)
  const indexById = list.findIndex((item) => item.id === incoming.id)
  const indexByClientRequestId = clientRequestId
    ? list.findIndex((item) => getClientRequestId(item) === clientRequestId)
    : -1
  const index = indexById >= 0 ? indexById : indexByClientRequestId

  if (index === -1) {
    return [...list, incoming].sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
  }

  const next = [...list]
  next[index] = { ...next[index], ...incoming }
  return next.sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
}

/** Inbox sidebar filter; must match server `filter` param. */
export const DEFAULT_INBOX_FILTER = 'all'

function readAutoAssignOnSelect() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('inbox-auto-assign-on-select') === 'true'
  } catch {
    return false
  }
}

export const useInboxStore = create((set) => ({
  conversations: [],
  activeConversationId: '',
  /** organization_members.id for the current user — drives "assigned to me" tier. */
  inboxSortMemberId: null,
  /** Active sidebar filter (drives list + refetch). */
  activeFilter: DEFAULT_INBOX_FILTER,
  /** Optional conversation tag filter (Phase 2). */
  activeTagId: null,
  /** Classification intent when `activeFilter` is `ai_intent` (Phase 4). */
  activeAiIntent: null,
  /** Server bucket counts for sidebar badges. */
  filterCounts: {
    inbox: 0,
    mentions: 0,
    created_by_you: 0,
    all: 0,
    unassigned: 0,
    spam: 0,
    sla_risk: 0,
    ingress_spam: 0,
    closed: 0,
  },
  /**
   * Cached first page per filter (short TTL; used when switching views).
   * @type {Record<string, { items: unknown[], pagination: object, fetchedAt: number }>}
   */
  conversationFilterCache: {},
  /** When true, selecting a thread PATCH-assigns it to the current agent if unassigned / assigned elsewhere. */
  autoAssignOnSelect: readAutoAssignOnSelect(),
  messagesByConversationId: {},
  typingState: {},
  activeViewersByConversationId: {},
  /** Pagination metadata from API — ready for load-more / infinite scroll. */
  conversationPagination: {
    page: 1,
    pageSize: 50,
    hasMore: false,
    total: null,
  },

  setInboxSortMemberId: (memberId) =>
    set((state) => {
      const id = memberId ?? null
      const sorted = sortConversationsInbox(state.conversations, id)
      return {
        inboxSortMemberId: id,
        conversations: trimConversationsToCap(
          sorted,
          MAX_CONVERSATIONS_IN_MEMORY,
          state.activeConversationId,
          id,
        ),
      }
    }),

  setActiveFilter: (activeFilter) => set({ activeFilter }),

  setActiveTagId: (activeTagId) => set({ activeTagId: activeTagId || null }),

  setActiveAiIntent: (activeAiIntent) => set({ activeAiIntent: activeAiIntent || null }),

  setFilterCounts: (counts) =>
    set((state) => ({
      filterCounts: { ...state.filterCounts, ...(counts ?? {}) },
    })),

  cacheConversationFilterPage: (filterType, payload) =>
    set((state) => ({
      conversationFilterCache: {
        ...state.conversationFilterCache,
        [filterType]: {
          items: payload?.items ?? [],
          pagination: payload?.pagination ?? {},
          fetchedAt: Date.now(),
        },
      },
    })),

  invalidateConversationFilterCache: () => set({ conversationFilterCache: {} }),

  /** Increment to flash Mentions nav / drive realtime mention cues (no persistence). */
  mentionsNotifyEpoch: 0,
  pulseMentionsNotification: () =>
    set((state) => ({
      mentionsNotifyEpoch: state.mentionsNotifyEpoch + 1,
    })),

  setAutoAssignOnSelect: (value) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('inbox-auto-assign-on-select', value ? 'true' : 'false')
      }
    } catch {
      /* ignore quota / privacy mode */
    }
    set({ autoAssignOnSelect: Boolean(value) })
  },

  /**
   * Replace first page from API. Sorts, trims to cap, stores pagination.
   * @param {{ items?: unknown[], pagination?: { page?: number, pageSize?: number, total?: number } }} payload
   */
  setConversationsPage: (payload) =>
    set((state) => {
      const items = payload?.items ?? []
      const pg = payload?.pagination ?? {}
      const page = pg.page ?? 1
      const pageSize = pg.pageSize ?? (items.length || 50)
      const total = typeof pg.total === 'number' ? pg.total : null
      const mid = state.inboxSortMemberId ?? null
      const sorted = sortConversationsInbox(items, mid)
      const conversations = trimConversationsToCap(sorted, MAX_CONVERSATIONS_IN_MEMORY, state.activeConversationId, mid)
      return {
        conversations,
        activeConversationId: state.activeConversationId || conversations[0]?.id || '',
        conversationPagination: {
          page,
          pageSize,
          hasMore: total != null ? page * pageSize < total : items.length >= pageSize,
          total,
        },
      }
    }),

  /**
   * Append a page (e.g. load more). Merges by id, re-sorts, trims — future-ready.
   */
  appendConversationsPage: (payload) =>
    set((state) => {
      const newItems = payload?.items ?? []
      const pg = payload?.pagination ?? {}
      const byId = new Map()
      for (const c of state.conversations) {
        byId.set(c.id, c)
      }
      for (const c of newItems) {
        if (c?.id) byId.set(c.id, { ...byId.get(c.id), ...c })
      }
      const mid = state.inboxSortMemberId ?? null
      const merged = sortConversationsInbox([...byId.values()], mid)
      const conversations = trimConversationsToCap(merged, MAX_CONVERSATIONS_IN_MEMORY, state.activeConversationId, mid)
      const page = pg.page ?? state.conversationPagination.page + 1
      const pageSize = pg.pageSize ?? state.conversationPagination.pageSize
      const total = typeof pg.total === 'number' ? pg.total : state.conversationPagination.total

      return {
        conversations,
        conversationPagination: {
          page,
          pageSize,
          hasMore: total != null ? page * pageSize < total : newItems.length >= pageSize,
          total,
        },
      }
    }),

  upsertConversation: (conversation) =>
    set((state) => ({
      conversations: trimConversationsToCap(
        mergeConversationInboxSort(state.conversations, conversation, state.inboxSortMemberId),
        MAX_CONVERSATIONS_IN_MEMORY,
        state.activeConversationId,
        state.inboxSortMemberId ?? null,
      ),
    })),

  removeConversation: (conversationId) =>
    set((state) => {
      const nextConversations = state.conversations.filter((item) => item.id !== conversationId)
      const nextMessages = { ...state.messagesByConversationId }
      delete nextMessages[conversationId]
      const nextTypingState = { ...state.typingState }
      delete nextTypingState[conversationId]
      return {
        conversations: nextConversations,
        conversationFilterCache: {},
        messagesByConversationId: nextMessages,
        typingState: nextTypingState,
        activeConversationId:
          state.activeConversationId === conversationId ? nextConversations[0]?.id ?? '' : state.activeConversationId,
      }
    }),

  setActiveConversationId: (conversationId) =>
    set({
      activeConversationId: conversationId,
    }),

  addMessage: (conversationId, message) =>
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: upsertMessage(state.messagesByConversationId[conversationId] ?? [], message),
      },
    })),

  addOptimisticMessage: (conversationId, message) =>
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: upsertMessage(state.messagesByConversationId[conversationId] ?? [], { ...message, optimistic: true }),
      },
    })),

  removeMessage: (conversationId, messageId) =>
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: (state.messagesByConversationId[conversationId] ?? []).filter((item) => item.id !== messageId),
      },
    })),

  rollbackOptimisticMessage: (conversationId, messageId) =>
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: (state.messagesByConversationId[conversationId] ?? []).filter((item) => item.id !== messageId),
      },
    })),

  patchConversationMessage: (conversationId, messageId, patch) =>
    set((state) => {
      const list = state.messagesByConversationId[conversationId]
      if (!list) return {}
      let changed = false
      const next = list.map((item) => {
        if (item.id !== messageId) return item
        changed = true
        return { ...item, ...patch }
      })
      if (!changed) return {}
      return {
        messagesByConversationId: {
          ...state.messagesByConversationId,
          [conversationId]: next,
        },
      }
    }),

  setMessagesForConversation: (conversationId, messages) =>
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: (messages ?? []).reduce(
          (acc, item) => upsertMessage(acc, { ...item, optimistic: false }),
          state.messagesByConversationId[conversationId] ?? [],
        ),
      },
    })),

  touchConversationWithMessage: (conversationId, message) =>
    set((state) => {
      const existing = state.conversations.find((item) => item.id === conversationId)
      if (!existing) return {}
      const patch = {
        ...existing,
        last_message_at: message.created_at,
        last_message_preview: message.content,
      }
      const mid = state.inboxSortMemberId ?? null
      return {
        conversations: trimConversationsToCap(
          mergeConversationInboxSort(state.conversations, patch, mid),
          MAX_CONVERSATIONS_IN_MEMORY,
          state.activeConversationId,
          mid,
        ),
      }
    }),

  setActiveViewersForConversation: (conversationId, viewers) =>
    set((state) => ({
      activeViewersByConversationId: {
        ...state.activeViewersByConversationId,
        [conversationId]: viewers,
      },
    })),

  resetActiveViewers: () =>
    set({
      activeViewersByConversationId: {},
    }),

  setTypingState: (conversationId, typingUsers) =>
    set((state) => ({
      typingState: {
        ...state.typingState,
        [conversationId]: typingUsers,
      },
    })),
}))
