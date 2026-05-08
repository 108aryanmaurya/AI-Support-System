import { useEffect } from 'react'
import {
  subscribeToConversationMessages,
  subscribeToOrganizationConversations,
  subscribeToOrganizationMessages,
} from '../services/realtime.js'

export function useConversationMessagesRealtime({
  organizationId,
  conversationId,
  onInsert,
  onUpdate,
  onDelete,
  onStatusChange,
}) {
  useEffect(() => {
    const unsubscribe = subscribeToConversationMessages({
      organizationId,
      conversationId,
      onInsert,
      onUpdate,
      onDelete,
      onStatusChange,
    })
    return unsubscribe
  }, [organizationId, conversationId, onInsert, onUpdate, onDelete, onStatusChange])
}

export function useOrganizationConversationsRealtime({
  organizationId,
  onInsert,
  onUpdate,
  onDelete,
  onStatusChange,
}) {
  useEffect(() => {
    const unsubscribe = subscribeToOrganizationConversations({
      organizationId,
      onInsert,
      onUpdate,
      onDelete,
      onStatusChange,
    })
    return unsubscribe
  }, [organizationId, onInsert, onUpdate, onDelete, onStatusChange])
}

export function useOrganizationMessagesRealtime({
  organizationId,
  onInsert,
  onUpdate,
  onDelete,
  onStatusChange,
}) {
  useEffect(() => {
    const unsubscribe = subscribeToOrganizationMessages({
      organizationId,
      onInsert,
      onUpdate,
      onDelete,
      onStatusChange,
    })
    return unsubscribe
  }, [organizationId, onInsert, onUpdate, onDelete, onStatusChange])
}
