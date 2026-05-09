import { useInboxStore } from '../stores/inboxStore.js'

/** Match server-ish limit (see TestSendMessagePage). */
export const MAX_OUTBOUND_MESSAGE_LENGTH = 4000

/** In-flight POST per conversation to prevent double sends. */
const inFlightByConversationId = new Map()

export function validateOutboundMessage(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Invalid message.', content: '' }
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'Message cannot be empty.', content: '' }
  }
  if (trimmed.length > MAX_OUTBOUND_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Message must be ${MAX_OUTBOUND_MESSAGE_LENGTH} characters or fewer.`,
      content: trimmed,
    }
  }
  return { ok: true, error: '', content: trimmed }
}

function newClientRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `client-${globalThis.crypto.randomUUID()}`
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * @param {{
 *   organizationId: string
 *   senderUserId: string | null
 *   apiFetch: typeof import('../services/api.js').apiFetch
 * }} deps
 */
export function createSendMessage(deps) {
  const { organizationId, senderUserId, apiFetch } = deps

  /**
   * @param {string} conversationId
   * @param {string} rawContent draft / unsanitized composer value
   * @returns {Promise<{ ok: true } | { ok: false; error?: string; skipped?: boolean }>}
   */
  return async function sendMessage(conversationId, rawContent) {
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

    const clientRequestId = newClientRequestId()
    const optimisticId = `temp-${clientRequestId}`
    const nowIso = new Date().toISOString()

    const optimisticMessage = {
      id: optimisticId,
      conversation_id: conversationId,
      organization_id: organizationId,
      sender_type: 'agent',
      sender_user_id: senderUserId,
      content,
      created_at: nowIso,
      metadata: {
        client_request_id: clientRequestId,
      },
      optimistic: true,
      sendFailed: false,
    }

    const store = useInboxStore.getState()
    store.addOptimisticMessage(conversationId, optimisticMessage)
    store.touchConversationWithMessage(conversationId, optimisticMessage)

    try {
      const response = await apiFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          organizationId,
          conversationId,
          senderType: 'agent',
          content,
          metadata: {
            client_request_id: clientRequestId,
          },
        }),
      })

      const serverMessage = response?.message
      if (serverMessage) {
        store.addMessage(conversationId, {
          ...serverMessage,
          optimistic: false,
          sendFailed: false,
        })
        store.touchConversationWithMessage(conversationId, serverMessage)
      }

      return { ok: true }
    } catch (err) {
      store.patchConversationMessage(conversationId, optimisticId, {
        optimistic: false,
        sendFailed: true,
      })
      return { ok: false, error: err?.message || 'Failed to send message.' }
    } finally {
      inFlightByConversationId.delete(lockKey)
    }
  }
}
