import { create } from 'zustand'

/** Hard cap for conversations kept in client memory (pagination / load-more trim). */
export const MAX_CONVERSATIONS_IN_MEMORY = 100

function getClientRequestId(message) {
  return message?.metadata?.client_request_id ?? message?.client_request_id ?? ''
}

function lastMessageMs(conversation) {
  return new Date(conversation?.last_message_at ?? 0).getTime()
}

/** Sort by last_message_at descending (newest activity first). */
export function sortConversationsByLastMessageDesc(items) {
  return [...(items ?? [])].sort((a, b) => lastMessageMs(b) - lastMessageMs(a))
}

/**
 * Drop overflow from a list already sorted DESC by last_message_at.
 * Keeps `pinnedConversationId` visible when possible (e.g. active thread).
 */
export function trimConversationsToCap(sortedDescList, max, pinnedConversationId = '') {
  if (sortedDescList.length <= max) return sortedDescList
  if (!pinnedConversationId) return sortedDescList.slice(0, max)

  const top = sortedDescList.slice(0, max)
  if (top.some((c) => c.id === pinnedConversationId)) return top

  const pinned = sortedDescList.find((c) => c.id === pinnedConversationId)
  if (!pinned) return sortedDescList.slice(0, max)

  const rest = sortedDescList.filter((c) => c.id !== pinned.id)
  return sortConversationsByLastMessageDesc([pinned, ...rest]).slice(0, max)
}

/**
 * Insert / merge one conversation and reorder by last_message_at DESC without full-array sort.
 * Reuses unchanged row references from `list` where possible.
 */
function upsertConversationOrdered(list, incoming) {
  const id = incoming?.id
  if (!id) return list

  const idx = list.findIndex((c) => c.id === id)
  const merged = idx >= 0 ? { ...list[idx], ...incoming } : { ...incoming }
  const without = idx >= 0 ? [...list.slice(0, idx), ...list.slice(idx + 1)] : [...list]

  const t = lastMessageMs(merged)
  let insertAt = without.findIndex((c) => lastMessageMs(c) < t)
  if (insertAt === -1) insertAt = without.length

  return [...without.slice(0, insertAt), merged, ...without.slice(insertAt)]
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

export const useInboxStore = create((set) => ({
  conversations: [],
  activeConversationId: '',
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
      const sorted = sortConversationsByLastMessageDesc(items)
      const conversations = trimConversationsToCap(sorted, MAX_CONVERSATIONS_IN_MEMORY, state.activeConversationId)
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

  /** @deprecated Use setConversationsPage. Kept for minimal call sites. */
  setConversations: (items) =>
    set((state) => {
      const sorted = sortConversationsByLastMessageDesc(items ?? [])
      const conversations = trimConversationsToCap(sorted, MAX_CONVERSATIONS_IN_MEMORY, state.activeConversationId)
      return {
        conversations,
        activeConversationId: state.activeConversationId || conversations[0]?.id || '',
        conversationPagination: {
          page: 1,
          pageSize: sorted.length || 50,
          hasMore: false,
          total: null,
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
      const merged = sortConversationsByLastMessageDesc([...byId.values()])
      const conversations = trimConversationsToCap(merged, MAX_CONVERSATIONS_IN_MEMORY, state.activeConversationId)
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
        upsertConversationOrdered(state.conversations, conversation),
        MAX_CONVERSATIONS_IN_MEMORY,
        state.activeConversationId,
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
      return {
        conversations: trimConversationsToCap(
          upsertConversationOrdered(state.conversations, patch),
          MAX_CONVERSATIONS_IN_MEMORY,
          state.activeConversationId,
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
