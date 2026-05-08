import { useEffect, useMemo } from 'react'
import { supabase } from '../services/supabase.js'
import { apiFetch } from '../services/api.js'
import { useInboxStore } from '../stores/inboxStore.js'

const activeSubscriptions = new Map()

function buildSubscriptionKey(organizationId, userId) {
  return `inbox:${organizationId}:${userId || 'anonymous'}`
}

function isReconnectStatus(status) {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'
}

function createRealtimeInboxSubscription({ organizationId, userId, subscriptionKey }) {
  let channel = null
  let reconnectTimer = null
  let closed = false
  let reconnectAttempt = 0
  let channelSequence = 0
  let authSubscription = null
  let subscribing = false
  const topicPrefix = `${subscriptionKey}:live`

  const knownConversationOrgMap = new Map()
  const inFlightConversationHydration = new Map()
  const rememberConversationOrg = (conversationId, orgId) => {
    if (!conversationId || !orgId) return
    knownConversationOrgMap.set(conversationId, orgId)
  }

  for (const conversation of useInboxStore.getState().conversations) {
    rememberConversationOrg(conversation.id, conversation.organization_id)
  }

  const clearReconnectTimer = () => {
    if (!reconnectTimer) return
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const fetchConversationOrg = async (conversationId) => {
    if (!conversationId) return ''
    if (knownConversationOrgMap.has(conversationId)) {
      return knownConversationOrgMap.get(conversationId)
    }

    try {
      const response = await apiFetch(`/api/conversations?organizationId=${organizationId}&page=1&pageSize=100`)
      const conversations = response?.items ?? []
      for (const item of conversations) {
        rememberConversationOrg(item.id, item.organization_id)
      }
    } catch {
      return ''
    }

    return knownConversationOrgMap.get(conversationId) ?? ''
  }

  const hydrateConversationById = async (conversationId) => {
    if (!conversationId) return null
    if (inFlightConversationHydration.has(conversationId)) {
      return inFlightConversationHydration.get(conversationId)
    }

    const pending = (async () => {
      try {
        const response = await apiFetch(`/api/conversations?organizationId=${organizationId}&page=1&pageSize=100`)
        const conversations = response?.items ?? []
        let target = null
        for (const item of conversations) {
          rememberConversationOrg(item.id, item.organization_id)
          if (!target && item.id === conversationId) target = item
        }
        return target
      } catch {
        return null
      } finally {
        inFlightConversationHydration.delete(conversationId)
      }
    })()

    inFlightConversationHydration.set(conversationId, pending)
    return pending
  }

  const handleMessageInsert = async (payload) => {
    const row = payload.new
    if (!row) return

    const rowOrgId = row.organization_id
    if (rowOrgId && rowOrgId !== organizationId) return
    if (!rowOrgId) {
      const resolvedOrgId = await fetchConversationOrg(row.conversation_id)
      if (resolvedOrgId !== organizationId) return
    }

    const store = useInboxStore.getState()
    store.addMessage(row.conversation_id, row)

    const existingConversation = store.conversations.find((item) => item.id === row.conversation_id)
    if (existingConversation) {
      store.upsertConversation({
        ...existingConversation,
        last_message_at: row.created_at,
        last_message_preview: row.content,
      })
      return
    }

    const hydratedConversation = await hydrateConversationById(row.conversation_id)
    if (!hydratedConversation) return
    useInboxStore.getState().upsertConversation({
      ...hydratedConversation,
      last_message_at: row.created_at,
      last_message_preview: row.content,
    })
  }

  const handleConversationUpdate = (payload) => {
    const row = payload.new
    if (!row) return
    if (row.organization_id !== organizationId) return
    rememberConversationOrg(row.id, row.organization_id)
    useInboxStore.getState().upsertConversation(row)
  }

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return
    const delayMs = Math.min(10_000, 1500 * 2 ** reconnectAttempt)
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      subscribe()
    }, delayMs)
  }

  const ensureRealtimeAuth = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) return false
    await supabase.realtime.setAuth(session.access_token)
    return true
  }

  const subscribe = async () => {
    if (closed || subscribing) return
    subscribing = true

    try {
      const canAuthenticateRealtime = await ensureRealtimeAuth()
      if (!canAuthenticateRealtime) {
        scheduleReconnect()
        return
      }

      const previousChannel = channel
      if (previousChannel) {
        channel = null
        supabase.removeChannel(previousChannel)
      }

      channelSequence += 1
      const topic = `${topicPrefix}:${channelSequence}:${Date.now()}:${Math.random().toString(36).slice(2)}`
      for (const existingChannel of supabase.getChannels()) {
        if (existingChannel.topic?.startsWith(topicPrefix) && existingChannel !== previousChannel) {
          supabase.removeChannel(existingChannel)
        }
      }
      const currentChannel = supabase.channel(topic)
      channel = currentChannel
      currentChannel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          if (closed || currentChannel !== channel) return
          handleMessageInsert(payload)
        },
      )
      currentChannel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          if (closed || currentChannel !== channel) return
          handleConversationUpdate(payload)
        },
      )

      currentChannel.subscribe((status) => {
        if (closed || currentChannel !== channel) return
        if (status === 'SUBSCRIBED') {
          reconnectAttempt = 0
          clearReconnectTimer()
          return
        }
        if (isReconnectStatus(status)) {
          scheduleReconnect()
        }
      })
    } finally {
      subscribing = false
    }
  }

  authSubscription = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (closed || !session?.access_token) return
    await supabase.realtime.setAuth(session.access_token)
    reconnectAttempt = 0
    subscribe()
  })

  subscribe()

  return () => {
    closed = true
    clearReconnectTimer()
    authSubscription?.data?.subscription?.unsubscribe()
    authSubscription = null
    if (channel) {
      const activeChannel = channel
      channel = null
      supabase.removeChannel(activeChannel)
    }
  }
}

export function useRealtimeInbox({ organizationId, userId }) {
  const subscriptionKey = useMemo(
    () => (organizationId ? buildSubscriptionKey(organizationId, userId) : ''),
    [organizationId, userId],
  )

  useEffect(() => {
    if (!organizationId || !subscriptionKey) return undefined
    const existing = activeSubscriptions.get(subscriptionKey)
    if (existing) {
      existing.refCount += 1
      return () => {
        const latest = activeSubscriptions.get(subscriptionKey)
        if (!latest) return
        latest.refCount -= 1
        if (latest.refCount <= 0) {
          latest.teardown()
          activeSubscriptions.delete(subscriptionKey)
        }
      }
    }

    const teardown = createRealtimeInboxSubscription({ organizationId, userId, subscriptionKey })
    activeSubscriptions.set(subscriptionKey, { refCount: 1, teardown })

    return () => {
      const latest = activeSubscriptions.get(subscriptionKey)
      if (!latest) return
      latest.refCount -= 1
      if (latest.refCount <= 0) {
        latest.teardown()
        activeSubscriptions.delete(subscriptionKey)
      }
    }
  }, [organizationId, subscriptionKey, userId])
}
