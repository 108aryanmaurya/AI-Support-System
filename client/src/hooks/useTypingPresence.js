import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '../services/supabase.js'
import { useInboxStore } from '../stores/inboxStore.js'

const DEFAULT_DEBOUNCE_MS = 400
const DEFAULT_STALE_MS = 5000
const STALE_SWEEP_MS = 1000

function buildTypingChannelName(conversationId) {
  return `typing:${conversationId}`
}

async function ensureRealtimeAuth() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return false
  await supabase.realtime.setAuth(session.access_token)
  return true
}

function presenceToTypingUsers(presenceState, selfUserId, staleMs) {
  const now = Date.now()
  /** @type {Map<string, { userId: string, name: string }>} */
  const byUser = new Map()

  for (const entries of Object.values(presenceState)) {
    for (const entry of entries) {
      const uid = entry?.userId
      if (!uid || uid === selfUserId) continue
      if (!entry?.isTyping) continue
      const updatedAt = Number(entry?.updatedAt) || 0
      if (now - updatedAt > staleMs) continue
      byUser.set(uid, {
        userId: uid,
        name: typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Someone',
      })
    }
  }

  return [...byUser.values()]
}

export function formatTypingIndicator(typingUsers) {
  if (!typingUsers?.length) return ''
  if (typingUsers.length === 1) {
    return `${typingUsers[0].name} is typing...`
  }
  return `${typingUsers.length} people typing...`
}

/**
 * Typing indicators via Supabase Realtime Presence on channel `typing:<conversation_id>`.
 * Presence payloads: `{ userId, name, isTyping, updatedAt }`.
 * - While typing: throttled `isTyping: true` (debounce window, default 400ms).
 * - After idle: `isTyping: false` after the same debounce delay.
 * - Stale: entries older than 5s (by updatedAt) are ignored; sweep every 1s.
 */
export function useTypingPresence({
  conversationId,
  userId,
  displayName,
  enabled = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  staleMs = DEFAULT_STALE_MS,
}) {
  const setTypingState = useInboxStore((state) => state.setTypingState)
  const channelRef = useRef(null)
  const idleStopTimerRef = useRef(null)
  const throttleTimerRef = useRef(null)
  const lastTypingTrueAtRef = useRef(0)
  const staleSweepTimerRef = useRef(null)
  const trackPayloadRef = useRef(() => ({}))

  const clearComposerTimers = useCallback(() => {
    if (idleStopTimerRef.current) {
      clearTimeout(idleStopTimerRef.current)
      idleStopTimerRef.current = null
    }
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current)
      throttleTimerRef.current = null
    }
  }, [])

  const syncFromPresence = useCallback(() => {
    const ch = channelRef.current
    if (!ch || !conversationId) return
    const typingUsers = presenceToTypingUsers(ch.presenceState(), userId, staleMs)
    setTypingState(conversationId, typingUsers)
  }, [conversationId, setTypingState, staleMs, userId])

  const sendPresence = useCallback(
    async (isTyping) => {
      const ch = channelRef.current
      if (!ch || !userId) return
      const payload = trackPayloadRef.current(isTyping)
      await ch.track(payload)
      const broadcastPayload = isTyping
        ? { userId: payload.userId, name: payload.name, isTyping: true }
        : { userId: payload.userId, isTyping: false }
      try {
        await ch.send({
          type: 'broadcast',
          event: 'typing',
          payload: broadcastPayload,
        })
      } catch {
        // presence is authoritative; broadcast is optional
      }
    },
    [userId],
  )

  const stopTypingImmediately = useCallback(() => {
    clearComposerTimers()
    lastTypingTrueAtRef.current = 0
    void sendPresence(false)
  }, [clearComposerTimers, sendPresence])

  const onComposerActivity = useCallback(() => {
    if (!enabled || !conversationId || !userId) return

    clearTimeout(idleStopTimerRef.current)
    idleStopTimerRef.current = setTimeout(() => {
      idleStopTimerRef.current = null
      lastTypingTrueAtRef.current = 0
      void sendPresence(false)
    }, debounceMs)

    const now = Date.now()
    const fireTrue = () => {
      lastTypingTrueAtRef.current = Date.now()
      void sendPresence(true)
    }

    if (now - lastTypingTrueAtRef.current >= debounceMs) {
      fireTrue()
      return
    }

    if (throttleTimerRef.current) return
    const delay = debounceMs - (now - lastTypingTrueAtRef.current)
    throttleTimerRef.current = setTimeout(() => {
      throttleTimerRef.current = null
      fireTrue()
    }, Math.max(0, delay))
  }, [conversationId, debounceMs, enabled, sendPresence, userId])

  useEffect(() => {
    trackPayloadRef.current = (isTyping) => ({
      userId: userId || '',
      name: displayName || 'Agent',
      isTyping,
      updatedAt: Date.now(),
    })
  }, [displayName, userId])

  useEffect(() => {
    if (!enabled || !conversationId || !userId) {
      if (conversationId) {
        setTypingState(conversationId, [])
      }
      return undefined
    }

    let cancelled = false
    let channel = null

    const teardownChannel = () => {
      if (staleSweepTimerRef.current) {
        clearInterval(staleSweepTimerRef.current)
        staleSweepTimerRef.current = null
      }
      clearComposerTimers()
      lastTypingTrueAtRef.current = 0

      const ch = channelRef.current
      channelRef.current = null
      if (ch) {
        void ch.untrack()
        supabase.removeChannel(ch)
      }
      setTypingState(conversationId, [])
    }

    const runSubscribe = async () => {
      const authed = await ensureRealtimeAuth()
      if (!authed || cancelled) return

      channel = supabase.channel(buildTypingChannelName(conversationId), {
        config: {
          broadcast: { self: true },
          presence: { key: userId },
        },
      })
      channelRef.current = channel

      const onPresenceChange = () => {
        if (cancelled || channelRef.current !== channel) return
        syncFromPresence()
      }

      channel
        .on('presence', { event: 'sync' }, onPresenceChange)
        .on('presence', { event: 'join' }, onPresenceChange)
        .on('presence', { event: 'leave' }, onPresenceChange)

      channel.subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || cancelled || channelRef.current !== channel) return
        await channel.track(trackPayloadRef.current(false))
        onPresenceChange()
      })
    }

    void runSubscribe()

    staleSweepTimerRef.current = setInterval(() => {
      syncFromPresence()
    }, STALE_SWEEP_MS)

    return () => {
      cancelled = true
      teardownChannel()
    }
  }, [
    clearComposerTimers,
    conversationId,
    enabled,
    setTypingState,
    syncFromPresence,
    userId,
  ])

  return {
    onComposerActivity,
    stopTypingImmediately,
  }
}
