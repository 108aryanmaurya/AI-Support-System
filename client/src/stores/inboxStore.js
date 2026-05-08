import { create } from 'zustand'

function sortByLastMessageDesc(items) {
  return [...items].sort((a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime())
}

function upsertById(list, incoming) {
  const index = list.findIndex((item) => item.id === incoming.id)
  if (index === -1) return sortByLastMessageDesc([incoming, ...list])
  const next = [...list]
  next[index] = { ...next[index], ...incoming }
  return sortByLastMessageDesc(next)
}

function upsertMessage(list, incoming) {
  const index = list.findIndex((item) => item.id === incoming.id)
  if (index === -1) {
    return [...list, incoming].sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
  }
  const next = [...list]
  next[index] = { ...next[index], ...incoming }
  return next
}

export const useInboxStore = create((set) => ({
  conversations: [],
  activeConversationId: '',
  messagesByConversationId: {},
  typingState: {},

  setConversations: (items) =>
    set((state) => {
      const sorted = sortByLastMessageDesc(items ?? [])
      return {
        conversations: sorted,
        activeConversationId: state.activeConversationId || sorted[0]?.id || '',
      }
    }),

  upsertConversation: (conversation) =>
    set((state) => ({
      conversations: upsertById(state.conversations, conversation),
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

  removeMessage: (conversationId, messageId) =>
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: (state.messagesByConversationId[conversationId] ?? []).filter((item) => item.id !== messageId),
      },
    })),

  setMessagesForConversation: (conversationId, messages) =>
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: [...(messages ?? [])].sort(
          (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
        ),
      },
    })),

  setTypingState: (conversationId, typingUsers) =>
    set((state) => ({
      typingState: {
        ...state.typingState,
        [conversationId]: typingUsers,
      },
    })),
}))
