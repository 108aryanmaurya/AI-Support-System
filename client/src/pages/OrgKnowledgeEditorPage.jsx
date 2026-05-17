import { ArrowLeft, Save, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import {
  archiveKnowledgeArticle,
  createKnowledgeArticle,
  createKnowledgeArticleVersion,
  fetchKnowledgeArticle,
  patchKnowledgeArticle,
  publishKnowledgeArticle,
} from '../services/knowledgeApi.js'

const VISIBILITIES = ['internal', 'public', 'restricted']

export default function OrgKnowledgeEditorPage() {
  const { orgId, articleId } = useParams()
  const navigate = useNavigate()
  const { organizations } = useOrganizationContext()
  const currentOrg = organizations.find((o) => o.orgId === orgId)
  const isAdmin = String(currentOrg?.role ?? '').toUpperCase() === 'ADMIN'
  const isNew = articleId === 'new' || !articleId
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [visibility, setVisibility] = useState('internal')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('draft')
  const [resolvedId, setResolvedId] = useState(isNew ? null : articleId)

  const load = useCallback(async () => {
    if (!orgId || isNew) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchKnowledgeArticle(orgId, articleId)
      const a = data.article
      setTitle(a.title ?? '')
      setSlug(a.slug ?? '')
      setVisibility(a.visibility ?? 'internal')
      setStatus(a.status ?? 'draft')
      setContent(data.version?.content ?? '')
      setResolvedId(a.id)
    } catch (e) {
      setError(e.message || 'Failed to load article.')
    } finally {
      setLoading(false)
    }
  }, [orgId, articleId, isNew])

  useEffect(() => {
    load()
  }, [load])

  async function handleSaveDraft() {
    if (!orgId || !title.trim()) {
      setError('Title is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (isNew && !resolvedId) {
        const created = await createKnowledgeArticle(orgId, {
          title: title.trim(),
          slug: slug.trim() || undefined,
          content,
          visibility,
        })
        const id = created.article?.id
        if (id) {
          setResolvedId(id)
          navigate(`/org/${orgId}/knowledge/${id}`, { replace: true })
        }
      } else {
        const id = resolvedId ?? articleId
        await createKnowledgeArticleVersion(orgId, id, content)
        await patchKnowledgeArticle(orgId, id, {
          title: title.trim(),
          slug: slug.trim() || undefined,
          visibility,
        })
      }
    } catch (e) {
      setError(e.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    const id = resolvedId ?? articleId
    if (!orgId || !id || isNew || !isAdmin) return
    const label = title.trim() || 'this article'
    if (!window.confirm(`Archive "${label}"? It will be removed from search and drafts.`)) return
    setSaving(true)
    setError('')
    try {
      await archiveKnowledgeArticle(orgId, id)
      navigate(`/org/${orgId}/knowledge`)
    } catch (e) {
      setError(e.message || 'Failed to archive article.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (!orgId) return
    setSaving(true)
    setError('')
    try {
      let id = resolvedId ?? articleId
      if (isNew && !id) {
        await handleSaveDraft()
        id = resolvedId
      }
      if (!id) throw new Error('Save the article first.')
      await createKnowledgeArticleVersion(orgId, id, content)
      await patchKnowledgeArticle(orgId, id, {
        title: title.trim(),
        slug: slug.trim() || undefined,
        visibility,
      })
      await publishKnowledgeArticle(orgId, id)
      setStatus('published')
    } catch (e) {
      setError(e.message || 'Failed to publish.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#0b1020] text-sm text-slate-400">
        Loading article…
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0b1020] text-white">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#1d253a] px-4 py-3 md:px-6">
        <Link
          to={`/org/${orgId}/knowledge`}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft size={16} />
          Back
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">
          {isNew && !resolvedId ? 'New article' : title || 'Edit article'}
        </h1>
        <span className="rounded-md bg-[#151b2e] px-2 py-0.5 text-xs text-slate-400">{status}</span>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveDraft()}
          className="inline-flex items-center gap-1 rounded-lg border border-[#2b3858] bg-[#151b2e] px-3 py-1.5 text-sm hover:bg-[#1a2540] disabled:opacity-50"
        >
          <Save size={14} />
          Save draft
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handlePublish()}
          className="inline-flex items-center gap-1 rounded-lg bg-[#3b82f6] px-3 py-1.5 text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50"
        >
          <Upload size={14} />
          Publish
        </button>
        {isAdmin && !isNew && resolvedId && status !== 'archived' ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleArchive()}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-900/50 bg-rose-950/20 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
          >
            <Trash2 size={14} />
            Archive
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        {error ? (
          <p className="mb-4 rounded-lg border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        ) : null}

        <div className="mx-auto max-w-3xl space-y-4">
          <label className="block text-sm text-slate-400">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#2b3858] bg-[#151b2e] px-3 py-2 text-white outline-none focus:border-[#4f6290]"
            />
          </label>
          <label className="block text-sm text-slate-400">
            Slug
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-from-title"
              className="mt-1 w-full rounded-lg border border-[#2b3858] bg-[#151b2e] px-3 py-2 text-white outline-none focus:border-[#4f6290]"
            />
          </label>
          <label className="block text-sm text-slate-400">
            Visibility
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#2b3858] bg-[#151b2e] px-3 py-2 text-white outline-none focus:border-[#4f6290]"
            >
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-400">
            Content
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={18}
              className="mt-1 w-full resize-y rounded-lg border border-[#2b3858] bg-[#151b2e] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#4f6290]"
            />
          </label>
        </div>
      </div>
    </div>
  )
}
