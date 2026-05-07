import { supabase } from './supabase.js'

function buildChannelName(prefix, parts) {
  return `${prefix}:${parts.filter(Boolean).join(':')}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function createManagedSubscription({ channelName, registerHandlers, onStatusChange, reconnectDelayMs = 2000 }) {
  let channel = null
  let reconnectTimer = null
  let isManuallyClosed = false

  function clearReconnectTimer() {
    if (!reconnectTimer) return
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  function scheduleReconnect() {
    clearReconnectTimer()
    reconnectTimer = setTimeout(() => {
      if (!isManuallyClosed) {
        subscribe()
      }
    }, reconnectDelayMs)
  }

  function subscribe() {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }

    channel = supabase.channel(channelName)
    registerHandlers(channel)
    channel.subscribe((status) => {
      onStatusChange?.(status)
      if (status === 'SUBSCRIBED') {
        clearReconnectTimer()
        return
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (!isManuallyClosed) scheduleReconnect()
      }
    })
  }

  subscribe()

  return () => {
    isManuallyClosed = true
    clearReconnectTimer()
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
  }
}

export function subscribeToConversationMessages({
  organizationId,
  conversationId,
  onInsert,
  onUpdate,
  onDelete,
  onStatusChange,
  reconnectDelayMs = 2000,
}) {
  if (!organizationId || !conversationId) return () => {}

  const channelName = buildChannelName('messages', [organizationId, conversationId])

  return createManagedSubscription({
    channelName,
    onStatusChange,
    reconnectDelayMs,
    registerHandlers: (channel) => {
      const scopedHandler = (handler) => (payload) => {
        const rowOrg = payload.new?.organization_id ?? payload.old?.organization_id
        const rowConversation = payload.new?.conversation_id ?? payload.old?.conversation_id
        if (rowOrg !== organizationId || rowConversation !== conversationId) return
        handler?.(payload)
      }

      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        scopedHandler(onInsert),
      )
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        scopedHandler(onUpdate),
      )
      channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        scopedHandler(onDelete),
      )
    },
  })
}

export function subscribeToOrganizationConversations({
  organizationId,
  onInsert,
  onUpdate,
  onDelete,
  onStatusChange,
  reconnectDelayMs = 2000,
}) {
  if (!organizationId) return () => {}

  const channelName = buildChannelName('conversations', [organizationId])

  return createManagedSubscription({
    channelName,
    onStatusChange,
    reconnectDelayMs,
    registerHandlers: (channel) => {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => onInsert?.(payload),
      )
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => onUpdate?.(payload),
      )
      channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => onDelete?.(payload),
      )
    },
  })
}
