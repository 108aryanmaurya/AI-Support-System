import { useCallback, useEffect, useRef } from 'react'
import { apiFetch } from '../services/api.js'
import { REALTIME_INBOX } from '../config/realtimeInbox.config.js'
import { useInboxStore } from '../stores/inboxStore.js'

function logSync(phase, detail) {
  const enabled =
    import.meta.env.DEV || import.meta.env.VITE_DEBUG_REALTIME === 'true'
  if (!enabled) return
  // eslint-disable-next-line no-console
  console.info('[inbox:sync]', phase, detail ?? '')
}

function parseTime(iso) {
  const t = new Date(iso ?? 0).getTime()
  return Number.isFinite(t) ? t : 0
}

/**
 * Polling + drift detection when Realtime may miss events.
 * Refetches on tab visibility after hidden.
 */
export function useInboxPeriodicSync({
  organizationId,
  activeConversationId,
  enabled = true,
}) {
  const intervalRef = useRef(null)

  const runSync = useCallback(async () => {
    if (!organizationId || !enabled) return

    try {
      const convResponse = await apiFetch(
        `/api/conversations?organizationId=${organizationId}&page=1&pageSize=50`,
      )
      const items = convResponse?.items ?? []

      for (const serverConv of items) {
        if (!serverConv?.id) continue
        const store = useInboxStore.getState()
        const local = store.conversations.find((c) => c.id === serverConv.id)
        const serverTs = parseTime(serverConv.last_message_at)
        const localTs = local ? parseTime(local.last_message_at) : 0

        if (!local) {
          store.upsertConversation(serverConv)
          continue
        }
        if (serverTs > localTs + REALTIME_INBOX.conversationDriftMs) {
          logSync('conversation_drift', {
            conversationId: serverConv.id,
            server: serverConv.last_message_at,
            client: local.last_message_at,
          })
          store.upsertConversation(serverConv)
        }
      }

      const convId = activeConversationId
      if (!convId) return

      const msgResponse = await apiFetch(
        `/api/conversations/${convId}/messages?organizationId=${organizationId}&page=1&pageSize=100`,
      )
      const apiItems = msgResponse?.items ?? []
      const localMsgs = useInboxStore.getState().messagesByConversationId[convId] ?? []
      const lastLocal =
        localMsgs.filter((m) => !m.optimistic).pop() ?? localMsgs[localMsgs.length - 1]
      const lastApi = apiItems[apiItems.length - 1]

      if (!lastApi) return

      const drift =
        !lastLocal ||
        lastApi.id !== lastLocal.id ||
        parseTime(lastApi.created_at) >
          parseTime(lastLocal.created_at) + REALTIME_INBOX.conversationDriftMs

      if (drift) {
        logSync('messages_drift_resync', {
          conversationId: convId,
          apiLastId: lastApi.id,
          localLastId: lastLocal?.id,
        })
        useInboxStore.getState().setMessagesForConversation(convId, apiItems)
      }
    } catch (err) {
      logSync('sync_error', err?.message ?? err)
    }
  }, [organizationId, activeConversationId, enabled])

  useEffect(() => {
    if (!organizationId || !enabled) return undefined

    const jitter = Math.floor(Math.random() * REALTIME_INBOX.periodicSyncJitterMs)
    const period = REALTIME_INBOX.periodicSyncIntervalMs + jitter

    intervalRef.current = setInterval(() => {
      void runSync()
    }, period)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        logSync('visibility_refresh')
        void runSync()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [organizationId, enabled, runSync])

  useEffect(() => {
    if (!organizationId || !enabled || !activeConversationId) return undefined
    const t = setTimeout(() => void runSync(), 0)
    return () => clearTimeout(t)
  }, [activeConversationId, organizationId, enabled, runSync])
}
