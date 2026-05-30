import { normalizeConversationRecord } from '@ai-support/shared'
import { useInboxStore } from '../stores/inboxStore.js'
import { validateOutboundMessage } from './conversationSendMessage.js'

/** In-flight POST per conversation to prevent double sends. */
const inFlightByConversationId = new Map()

function newClientRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `client-${globalThis.crypto.randomUUID()}`
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * @param {{ organizationId: string, senderUserId: string | null, apiFetch: Function }} deps
 */
export function createSendInternalNote(deps) {
  const { organizationId, senderUserId, apiFetch } = deps

  /**
   * @param {string} conversationId
   * @param {string} rawContent
   * @returns {Promise<{ ok: true, message?: object } | { ok: false, error?: string; skipped?: boolean }>}
   */
  return async function sendInternalNote(conversationId, rawContent) {
    const validated = validateOutboundMessage(rawContent)
    if (!validated.ok) {
      return { ok: false, error: validated.error }
    }

    if (!organizationId?.trim()) {
      return { ok: false, error: 'Organization is missing.' }
    }

    const content = validated.content
    const lockKey = conversationId
    if (!lockKey || inFlightByConversationId.get(lockKey)) {
      return { ok: false, skipped: true }
    }

    inFlightByConversationId.set(lockKey, true)

    const store = useInboxStore.getState()
    const clientRequestId = newClientRequestId()
    const optimisticId = `temp-note-${clientRequestId}`
    const nowIso = new Date().toISOString()

    const optimisticMessage = {
      id: optimisticId,
      conversation_id: conversationId,
      organization_id: organizationId,
      sender_type: 'internal_note',
      sender_user_id: senderUserId,
      content,
      created_at: nowIso,
      metadata: {
        client_request_id: clientRequestId,
        status: 'sent',
        delivery_status: 'sent',
      },
      optimistic: true,
    }

    store.addOptimisticMessage(conversationId, optimisticMessage)
    store.touchConversationWithMessage(conversationId, optimisticMessage)

    try {
      const data = await apiFetch(
        `/api/org/${encodeURIComponent(organizationId)}/messages/internal-note`,
        {
          method: 'POST',
          body: JSON.stringify({
            conversation_id: conversationId,
            content,
            client_request_id: clientRequestId,
          }),
        },
      )

      const serverMessage = data?.message
      store.removeMessage(conversationId, optimisticId)

      if (serverMessage) {
        const merged = {
          ...serverMessage,
          optimistic: false,
          metadata: {
            ...(serverMessage.metadata && typeof serverMessage.metadata === 'object'
              ? serverMessage.metadata
              : {}),
            status: 'sent',
            delivery_status: 'sent',
          },
        }
        store.addMessage(conversationId, merged)
        store.touchConversationWithMessage(conversationId, merged)
      }

      return { ok: true, message: serverMessage ?? null }
    } catch (err) {
      store.removeMessage(conversationId, optimisticId)
      return { ok: false, error: err?.message || 'Failed to post internal note.' }
    } finally {
      inFlightByConversationId.delete(lockKey)
    }
  }
}
