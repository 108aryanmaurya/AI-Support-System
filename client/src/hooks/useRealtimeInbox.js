import { useEffect, useMemo, useRef } from 'react'
import { mergeConversationRecords } from '@ai-support/shared'
import { supabase } from '../services/supabase.js'
import { apiFetch } from '../services/api.js'
import { conversationsListUrl } from '../services/inboxApi.js'
import { REALTIME_INBOX } from '../config/realtimeInbox.config.js'
import { useInboxStore } from '../stores/inboxStore.js'

const activeSubscriptions = new Map()

function buildSubscriptionKey(organizationId, userId) {
  return `inbox:${organizationId}:${userId || 'anonymous'}`
}

function isReconnectStatus(status) {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'
}

const DEBUG_REALTIME =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_REALTIME === 'true'

/** DEV-only: subscription filters / auth — DB blocks leaks via RLS; log mismatches for debugging misconfiguration */
function logRealtimeInboxDebug(...args) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn('[realtime:inbox]', ...args)
  }
}

function logRealtimeLifecycle(phase, detail) {
  if (!DEBUG_REALTIME) return
  // eslint-disable-next-line no-console
  console.info('[realtime:inbox:lifecycle]', phase, detail ?? '')
}

function reconnectDelayMs(attempt) {
  return Math.min(
    REALTIME_INBOX.maxReconnectDelayMs,
    REALTIME_INBOX.reconnectBaseDelayMs * 2 ** attempt,
  )
}

function createRealtimeInboxSubscription({ organizationId, userId, subscriptionKey, notifyReconnect }) {
  let channel = null
  let reconnectTimer = null
  let closed = false
  let reconnectAttempt = 0
  let channelSequence = 0
  let authSubscription = null
  let subscribing = false
  let latestPresence = {
    userId: userId || '',
    conversationId: '',
  }
  const topicPrefix = `${subscriptionKey}:live`

  /** After WS/auth trouble, next SUBSCRIBED triggers HTTP refetch (missed events). */
  let pendingRefetchAfterReconnect = false

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
      const filter = useInboxStore.getState().activeFilter ?? 'all'
      const response = await apiFetch(conversationsListUrl(organizationId, filter, { page: 1, pageSize: 100 }))
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
        const filter = useInboxStore.getState().activeFilter ?? 'all'
      const response = await apiFetch(conversationsListUrl(organizationId, filter, { page: 1, pageSize: 100 }))
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
    if (rowOrgId && rowOrgId !== organizationId) {
      logRealtimeInboxDebug('dropped_event', {
        reason: 'filter_org_mismatch',
        rowOrgId,
        organizationId,
        conversationId: row.conversation_id,
      })
      return
    }
    if (!rowOrgId) {
      const resolvedOrgId = await fetchConversationOrg(row.conversation_id)
      if (resolvedOrgId !== organizationId) {
        logRealtimeInboxDebug('dropped_event', {
          reason: 'resolved_org_mismatch',
          resolvedOrgId,
          organizationId,
          conversationId: row.conversation_id,
        })
        return
      }
    }

    const store = useInboxStore.getState()
    store.addMessage(row.conversation_id, row)

    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
    const mentionIds = Array.isArray(meta.mentions) ? meta.mentions.map(String) : []
    if (
      userId &&
      mentionIds.includes(String(userId)) &&
      String(row.sender_user_id ?? '') !== String(userId)
    ) {
      store.pulseMentionsNotification()
    }

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
    if (row.organization_id !== organizationId) {
      logRealtimeInboxDebug('dropped_event', {
        reason: 'conversation_filter_org_mismatch',
        rowOrgId: row.organization_id,
        organizationId,
        conversationId: row.id,
      })
      return
    }
    rememberConversationOrg(row.id, row.organization_id)
    const store = useInboxStore.getState()
    const existing = store.conversations.find((c) => c.id === row.id)
    store.upsertConversation(mergeConversationRecords(existing, row))
  }

  const syncActiveViewers = () => {
    if (!channel) return
    const state = channel.presenceState()
    const byConversation = new Map()

    for (const entries of Object.values(state)) {
      for (const entry of entries) {
        const conversationId = entry?.conversationId
        if (!conversationId) continue
        if (!byConversation.has(conversationId)) {
          byConversation.set(conversationId, [])
        }
        byConversation.get(conversationId).push({
          userId: entry?.userId ?? '',
          at: entry?.at ?? null,
        })
      }
    }

    const store = useInboxStore.getState()
    store.resetActiveViewers()
    for (const [conversationId, viewers] of byConversation.entries()) {
      store.setActiveViewersForConversation(conversationId, viewers)
    }
  }

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return
    const delayMs = reconnectDelayMs(reconnectAttempt)
    reconnectAttempt += 1
    logRealtimeLifecycle('reconnect_scheduled', { delayMs, attempt: reconnectAttempt })
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
        logRealtimeLifecycle('auth_missing', 'session or token unavailable')
        logRealtimeInboxDebug('Realtime auth missing session; postgres_changes will not receive RLS-filtered rows')
        pendingRefetchAfterReconnect = true
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
      logRealtimeLifecycle('subscribe_attempt', { topicSuffix: channelSequence })
      for (const existingChannel of supabase.getChannels()) {
        if (existingChannel.topic?.startsWith(topicPrefix) && existingChannel !== previousChannel) {
          supabase.removeChannel(existingChannel)
        }
      }
      const currentChannel = supabase.channel(topic)
      channel = currentChannel
      currentChannel.on('presence', { event: 'sync' }, () => {
        if (closed || currentChannel !== channel) return
        syncActiveViewers()
      })
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
        logRealtimeLifecycle('subscription_status', status)
        if (status === 'SUBSCRIBED') {
          reconnectAttempt = 0
          clearReconnectTimer()
          if (pendingRefetchAfterReconnect) {
            pendingRefetchAfterReconnect = false
            try {
              notifyReconnect?.()
              logRealtimeLifecycle('post_reconnect_refetch')
            } catch (e) {
              logRealtimeLifecycle('post_reconnect_refetch_error', e?.message)
            }
          }
          currentChannel.track({
            userId: latestPresence.userId,
            conversationId: latestPresence.conversationId,
            at: new Date().toISOString(),
          })
          return
        }
        if (isReconnectStatus(status)) {
          pendingRefetchAfterReconnect = true
          logRealtimeInboxDebug('channel_unhealthy', status)
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

  return {
    setPresence: (nextPresence) => {
      latestPresence = { ...latestPresence, ...nextPresence }
      if (!channel) return
      channel.track({
        userId: latestPresence.userId,
        conversationId: latestPresence.conversationId,
        at: new Date().toISOString(),
      })
    },
    teardown: () => {
      closed = true
      pendingRefetchAfterReconnect = false
      clearReconnectTimer()
      logRealtimeLifecycle('teardown', subscriptionKey)
      authSubscription?.data?.subscription?.unsubscribe()
      authSubscription = null
      if (channel) {
        const activeChannel = channel
        channel = null
        supabase.removeChannel(activeChannel)
      }
      useInboxStore.getState().resetActiveViewers()
    },
  }
}

export function useRealtimeInbox({ organizationId, userId, onReconnect }) {
  const activeConversationId = useInboxStore((state) => state.activeConversationId)
  const onReconnectRef = useRef(onReconnect)
  onReconnectRef.current = onReconnect

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

    const created = createRealtimeInboxSubscription({
      organizationId,
      userId,
      subscriptionKey,
      notifyReconnect: () => onReconnectRef.current?.(),
    })
    activeSubscriptions.set(subscriptionKey, { refCount: 1, ...created })

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

  useEffect(() => {
    if (!organizationId || !subscriptionKey) return
    const active = activeSubscriptions.get(subscriptionKey)
    if (!active) return
    active.setPresence({
      userId: userId || '',
      conversationId: activeConversationId || '',
    })
  }, [activeConversationId, organizationId, subscriptionKey, userId])
}
