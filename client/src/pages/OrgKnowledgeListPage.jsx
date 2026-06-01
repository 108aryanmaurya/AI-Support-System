import { BookOpen, Plus, Search, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { useWorkspaceCanManage } from '../hooks/useWorkspaceCanManage.js'
import {
  archiveKnowledgeArticle,
  fetchKnowledgeArticles,
  fetchKnowledgeSources,
  searchKnowledge,
  uploadKnowledgeFile,
} from '../services/knowledgeApi.js'

const STATUS_TABS = [
  { id: '', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'published', label: 'Published' },
  { id: 'archived', label: 'Archived' },
]

export default function OrgKnowledgeListPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { organizations } = useOrganizationContext()
  const currentOrg = organizations.find((o) => o.orgId === orgId)
  const canManage = useWorkspaceCanManage(orgId)
  const [statusFilter, setStatusFilter] = useState('')
  const [articles, setArticles] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [sources, setSources] = useState([])
  const [uploading, setUploading] = useState(false)
  const [archivingId, setArchivingId] = useState(null)
  const fileInputRef = useRef(null)

  const loadArticles = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    setSearchResults(null)
    try {
      const data = await fetchKnowledgeArticles(orgId, {
        status: statusFilter || undefined,
        pageSize: 50,
      })
      setArticles(data.articles ?? [])
      setTotal(data.total ?? 0)
    } catch (e) {
      setError(e.message || 'Failed to load articles.')
    } finally {
      setLoading(false)
    }
  }, [orgId, statusFilter])

  const loadSources = useCallback(async () => {
    if (!orgId) return
    try {
      const data = await fetchKnowledgeSources(orgId)
      setSources(data.sources ?? [])
    } catch {
      setSources([])
    }
  }, [orgId])

  useEffect(() => {
    loadArticles()
    loadSources()
  }, [loadArticles, loadSources])

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!orgId || !file) return
    setUploading(true)
    setError('')
    try {
      await uploadKnowledgeFile(orgId, file)
      await loadSources()
      await loadArticles()
    } catch (err) {
      setError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleArchiveArticle(articleId, articleTitle) {
    if (!orgId || !canManage) return
    const label = articleTitle?.trim() || 'this article'
    if (!window.confirm(`Archive "${label}"? It will be removed from search and drafts.`)) return
    setArchivingId(articleId)
    setError('')
    try {
      await archiveKnowledgeArticle(orgId, articleId)
      await loadArticles()
    } catch (err) {
      setError(err.message || 'Failed to archive article.')
    } finally {
      setArchivingId(null)
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!orgId || !searchQ.trim()) return
    setSearching(true)
    setError('')
    try {
      const data = await searchKnowledge(orgId, { q: searchQ.trim(), limit: 25 })
      setSearchResults(data)
    } catch (err) {
      setError(err.message || 'Search failed.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0b1020] text-white">
      <header className="shrink-0 border-b border-[#1d253a] px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-[#3ECF8E]" />
            <h1 className="text-xl font-bold">Knowledge</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
              className="hidden"
              onChange={(ev) => void handleFileUpload(ev)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3858] bg-[#151b2e] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1a2540] disabled:opacity-50"
            >
              <Upload size={16} />
              {uploading ? 'Uploading…' : 'Import file'}
            </button>
            <Link
              to={`/org/${orgId}/knowledge/new`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2563eb]"
            >
              <Plus size={16} />
              New article
            </Link>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Import supports .txt, .md, and .pdf up to 512 KB. Processing runs in the background worker.
        </p>
        <form onSubmit={handleSearch} className="mt-4 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search published articles…"
              className="w-full rounded-lg border border-[#2b3858] bg-[#151b2e] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-[#4f6290]"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !searchQ.trim()}
            className="shrink-0 rounded-lg border border-[#2b3858] bg-[#151b2e] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a2540] disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        <nav className="mt-3 flex flex-wrap gap-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id || 'all'}
              type="button"
              onClick={() => setStatusFilter(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                statusFilter === t.id
                  ? 'bg-[#151b2e] text-white'
                  : 'text-slate-400 hover:bg-[#111827] hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        {error ? (
          <p className="mb-4 rounded-lg border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        ) : null}

        {searchResults ? (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">
              Search results ({searchResults.total ?? 0})
            </h2>
            {(searchResults.results ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No matching chunks found.</p>
            ) : (
              <ul className="space-y-3">
                {(searchResults.results ?? []).map((r) => (
                  <li key={r.chunkId} className="rounded-xl border border-[#1d253a] bg-[#151b2e] p-4">
                    <button
                      type="button"
                      onClick={() => navigate(`/org/${orgId}/knowledge/${r.article.id}`)}
                      className="text-left text-sm font-semibold text-[#7eb6ff] hover:underline"
                    >
                      {r.article.title}
                    </button>
                    <p className="mt-2 line-clamp-3 text-sm text-slate-300">{r.excerpt}</p>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setSearchResults(null)}
              className="mt-4 text-xs text-slate-500 hover:text-slate-300"
            >
              Clear search
            </button>
          </section>
        ) : null}

        {sources.length > 0 ? (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Recent imports</h2>
            <ul className="space-y-2">
              {sources.slice(0, 8).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-[#1d253a] bg-[#151b2e] px-3 py-2 text-sm"
                >
                  <span className="text-slate-200">{s.source_metadata?.fileName ?? s.id}</span>
                  <span className="text-xs text-slate-500">{s.status}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">
            Articles {total > 0 ? `(${total})` : ''}
          </h2>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : articles.length === 0 ? (
            <div className="rounded-xl border border-[#1d253a] bg-[#151b2e] p-8 text-center text-sm text-slate-400">
              No articles yet.{' '}
              <Link to={`/org/${orgId}/knowledge/new`} className="text-[#7eb6ff] hover:underline">
                Create one
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-[#1d253a] rounded-xl border border-[#1d253a] bg-[#151b2e]">
              {articles.map((a) => (
                <li key={a.id} className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => navigate(`/org/${orgId}/knowledge/${a.id}`)}
                    className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3 text-left hover:bg-[#1a2540]"
                  >
                    <span className="font-medium text-white">{a.title}</span>
                    <span className="text-xs text-slate-500">
                      {a.slug} · {a.status} · {a.visibility}
                    </span>
                  </button>
                  {canManage && a.status !== 'archived' ? (
                    <button
                      type="button"
                      title="Archive article"
                      disabled={archivingId === a.id}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        void handleArchiveArticle(a.id, a.title)
                      }}
                      className="shrink-0 px-3 text-slate-500 hover:bg-[#1a2540] hover:text-rose-400 disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}