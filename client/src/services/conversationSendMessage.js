import { resolveMentionUserIdsFromContent } from '@ai-support/shared'
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
 * Resolve UI delivery state for an agent row (optimistic + server metadata).
 * @param {Record<string, unknown>} message
 * @returns {'sending' | 'sent' | 'failed'}
 */
export function getMessageDeliveryStatus(message) {
  const meta = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {}
  const fromMeta = meta.status ?? meta.delivery_status
  if (fromMeta === 'pending' || fromMeta === 'sending') return 'sending'
  if (fromMeta === 'failed') return 'failed'
  if (fromMeta === 'sent') return 'sent'
  if (message?.sendFailed) return 'failed'
  if (message?.optimistic) return 'sending'
  if (message?.sender_type === 'agent') return 'sent'
  return 'sent'
}

/**
 * @param {{
 *   organizationId: string
 *   senderUserId: string | null
 *   apiFetch: typeof import('../services/api.js').apiFetch
 *   mentionMembers?: import('@ai-support/shared').MentionMemberInput[]
 * }} deps
 */
export function createSendMessage(deps) {
  const { organizationId, senderUserId, apiFetch, mentionMembers = [] } = deps

  /**
   * @param {string} conversationId
   * @param {string} rawContent
   * @param {{
   *   retryOfMessageId?: string
   *   aiLineage?: { isAiGenerated?: boolean; aiRunId?: string; parentMessageId?: string | null }
   * }} [options]
   * @returns {Promise<{ ok: true; message?: object } | { ok: false; error?: string; skipped?: boolean }>}
   */
  return async function sendMessage(conversationId, rawContent, options = {}) {
    const validated = validateOutboundMessage(rawContent)
    if (!validated.ok) {
      return { ok: false, error: validated.error }
    }

    if (!organizationId?.trim()) {
      return { ok: false, error: 'Organization is missing.' }
    }

    const content = validated.content
    const retryOfMessageId = typeof options.retryOfMessageId === 'string' ? options.retryOfMessageId : ''
    const aiLineage =
      options.aiLineage && typeof options.aiLineage === 'object' ? options.aiLineage : null

    const lockKey = conversationId
    if (!lockKey || inFlightByConversationId.get(lockKey)) {
      return { ok: false, skipped: true }
    }

    inFlightByConversationId.set(lockKey, true)

    const store = useInboxStore.getState()
    if (retryOfMessageId) {
      store.removeMessage(conversationId, retryOfMessageId)
    }

    const clientRequestId = newClientRequestId()
    const optimisticId = `temp-${clientRequestId}`
    const nowIso = new Date().toISOString()

    const resolvedMentions = resolveMentionUserIdsFromContent(content, mentionMembers ?? [])

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
        status: 'sending',
        delivery_status: 'sending',
        ...(resolvedMentions.length ? { mentions: resolvedMentions } : {}),
      },
      optimistic: true,
      sendFailed: false,
      delivery_status: 'sending',
    }

    store.addOptimisticMessage(conversationId, optimisticMessage)
    store.touchConversationWithMessage(conversationId, optimisticMessage)

    try {
      const sendBody = {
        conversation_id: conversationId,
        content,
        client_request_id: clientRequestId,
      }
      if (aiLineage?.isAiGenerated && aiLineage.aiRunId) {
        sendBody.is_ai_generated = true
        sendBody.ai_run_id = aiLineage.aiRunId
        if (aiLineage.parentMessageId) {
          sendBody.parent_message_id = aiLineage.parentMessageId
        }
      }

      const data = await apiFetch(`/api/org/${encodeURIComponent(organizationId)}/messages/send`, {
        method: 'POST',
        body: JSON.stringify(sendBody),
      })

      const serverMessage = data?.message
      store.removeMessage(conversationId, optimisticId)

      if (serverMessage) {
        const merged = {
          ...serverMessage,
          optimistic: false,
          sendFailed: false,
          delivery_status: 'sent',
          metadata: {
            ...(serverMessage.metadata && typeof serverMessage.metadata === 'object' ? serverMessage.metadata : {}),
            status: serverMessage.metadata?.status ?? 'sent',
            delivery_status: 'sent',
          },
        }
        store.addMessage(conversationId, merged)
        store.touchConversationWithMessage(conversationId, merged)
      }

      return { ok: true, message: serverMessage ?? null }
    } catch (err) {
      const list = useInboxStore.getState().messagesByConversationId[conversationId] ?? []
      const prev = list.find((m) => m.id === optimisticId)
      const prevMeta =
        prev?.metadata && typeof prev.metadata === 'object' ? { ...prev.metadata } : {}

      store.patchConversationMessage(conversationId, optimisticId, {
        optimistic: false,
        sendFailed: true,
        delivery_status: 'failed',
        metadata: {
          ...prevMeta,
          status: 'failed',
          delivery_status: 'failed',
        },
      })
      return { ok: false, error: err?.message || 'Failed to send message.' }
    } finally {
      inFlightByConversationId.delete(lockKey)
    }
  }
}
