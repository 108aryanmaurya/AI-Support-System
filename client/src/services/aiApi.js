import { apiFetch } from './api.js'

function aiBase(organizationId) {
  return `/api/org/${encodeURIComponent(organizationId)}/ai`
}

/**
 * @param {string} organizationId
 * @returns {Promise<{ ok: boolean, llmConfigured: boolean, organizationId?: string }>}
 */
export function getAiHealth(organizationId) {
  return apiFetch(`${aiBase(organizationId)}/health`)
}

/**
 * @param {string} organizationId
 * @param {object} body
 * @param {string} body.conversationId
 * @param {boolean} [body.useKnowledge]
 * @param {string} [body.tone]
 * @param {string} [body.length]
 */
export function suggestReply(organizationId, body) {
  return apiFetch(`${aiBase(organizationId)}/suggest-reply`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * @param {string} organizationId
 * @param {object} body
 * @param {string} body.conversationId
 * @param {'short' | 'detailed' | 'timeline'} [body.type]
 */
export function summarize(organizationId, body) {
  return apiFetch(`${aiBase(organizationId)}/summarize`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * @param {string} organizationId
 * @param {object} body
 * @param {string} body.text
 * @param {string} [body.targetLanguage]
 */
export function translate(organizationId, body) {
  return apiFetch(`${aiBase(organizationId)}/translate`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * @param {string} organizationId
 * @param {object} body
 * @param {string} body.text
 * @param {string} [body.tone]
 */
export function rewrite(organizationId, body) {
  return apiFetch(`${aiBase(organizationId)}/rewrite`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * @param {string} organizationId
 * @param {object} body
 * @param {string} body.aiRunId
 * @param {'accepted' | 'rejected' | 'edited'} body.action
 * @param {string} [body.messageId]
 * @param {string} [body.reason]
 */
export function postAiFeedback(organizationId, body) {
  return apiFetch(`${aiBase(organizationId)}/feedback`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
