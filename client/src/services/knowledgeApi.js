import { apiFetch } from './api.js'
import { supabase } from './supabase.js'

const apiBase = import.meta.env.VITE_API_URL ?? ''

function knowledgeBase(organizationId) {
  return `/api/org/${encodeURIComponent(organizationId)}/knowledge`
}

export function fetchKnowledgeArticles(organizationId, { status, page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (status) params.set('status', status)
  return apiFetch(`${knowledgeBase(organizationId)}/articles?${params}`)
}

export function fetchKnowledgeArticle(organizationId, articleId) {
  return apiFetch(`${knowledgeBase(organizationId)}/articles/${encodeURIComponent(articleId)}`)
}

export function createKnowledgeArticle(organizationId, body) {
  return apiFetch(`${knowledgeBase(organizationId)}/articles`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function patchKnowledgeArticle(organizationId, articleId, body) {
  return apiFetch(`${knowledgeBase(organizationId)}/articles/${encodeURIComponent(articleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function createKnowledgeArticleVersion(organizationId, articleId, content) {
  return apiFetch(
    `${knowledgeBase(organizationId)}/articles/${encodeURIComponent(articleId)}/versions`,
    { method: 'POST', body: JSON.stringify({ content }) },
  )
}

export function publishKnowledgeArticle(organizationId, articleId, versionId) {
  return apiFetch(
    `${knowledgeBase(organizationId)}/articles/${encodeURIComponent(articleId)}/publish`,
    {
      method: 'POST',
      body: JSON.stringify(versionId ? { versionId } : {}),
    },
  )
}

export function searchKnowledge(organizationId, { q, limit = 20, includeContext = false } = {}) {
  const params = new URLSearchParams({ q, limit: String(limit) })
  if (includeContext) params.set('includeContext', 'true')
  return apiFetch(`${knowledgeBase(organizationId)}/search?${params}`)
}

export function archiveKnowledgeArticle(organizationId, articleId) {
  return apiFetch(`${knowledgeBase(organizationId)}/articles/${encodeURIComponent(articleId)}`, {
    method: 'DELETE',
  })
}

export function fetchKnowledgeSources(organizationId, { status } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  const q = params.toString()
  return apiFetch(`${knowledgeBase(organizationId)}/sources${q ? `?${q}` : ''}`)
}

/** Multipart upload — field name must be `file` (max 512 KB). */
export async function uploadKnowledgeFile(organizationId, file) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const form = new FormData()
  form.append('file', file)
  const headers = {}
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  const res = await fetch(
    `${apiBase}/api/org/${encodeURIComponent(organizationId)}/knowledge/sources/upload`,
    { method: 'POST', headers, body: form, credentials: 'include' },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`)
  }
  return data
}
