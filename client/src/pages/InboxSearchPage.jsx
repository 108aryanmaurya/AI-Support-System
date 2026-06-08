import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2, Search } from 'lucide-react'
import { InboxSidebar } from '../components/InboxSidebar.jsx'
import { useInboxSidebarActions } from '../hooks/useInboxSidebarActions.js'
import { searchWorkspace } from '../services/searchApi.js'
import { fetchOrgTags } from '../services/tagsApi.js'

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

const PRIORITY_OPTIONS = [
  { value: '', label: 'Any priority' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const CHANNEL_OPTIONS = [
  { value: '', label: 'Any channel' },
  { value: 'email', label: 'Email' },
  { value: 'web', label: 'Web' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'messenger', label: 'Messenger' },
]

const ASSIGNEE_OPTIONS = [
  { value: '', label: 'Anyone' },
  { value: 'me', label: 'Assigned to me' },
  { value: 'unassigned', label: 'Unassigned' },
]

const ENTITY_BADGE = {
  conversation: 'bg-[#2a3f6b] text-slate-100',
  message: 'bg-[#3d2f5c] text-slate-100',
  customer: 'bg-[#1f4d3a] text-slate-100',
}

function resultLink(orgId, result) {
  if (result.entityType === 'customer') {
    const email = result.metadata?.email
    if (typeof email === 'string' && email.includes('@')) {
      return { href: `mailto:${email}`, external: true }
    }
    return null
  }
  const convId = result.conversationId || result.entityId
  return { href: `/org/${orgId}/inbox?conversation=${encodeURIComponent(convId)}`, external: false }
}

export default function InboxSearchPage() {
  const { orgId: orgFromRoute } = useParams()
  const navigate = useNavigate()
  const organizationId =
    (typeof orgFromRoute === 'string' && orgFromRoute.trim()) ||
    ''

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [channel, setChannel] = useState('')
  const [assignee, setAssignee] = useState('')
  const [tag, setTag] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [entityType, setEntityType] = useState('all')
  const [tags, setTags] = useState([])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const setLoadingNoop = useCallback(() => {}, [])
  const setErrorNoop = useCallback(() => {}, [])

  const goInboxFilter = useCallback(
    (filter) => {
      if (organizationId) navigate(`/org/${organizationId}/inbox?filter=${encodeURIComponent(filter)}`)
    },
    [organizationId, navigate],
  )

  const {
    onSelectPrimaryFilter: hookSelectPrimary,
    mentionCue,
    activeFilter,
    filterCounts,
  } = useInboxSidebarActions(organizationId, {
    setLoadingConversations: setLoadingNoop,
    setError: setErrorNoop,
    silentFilterRefetch: true,
  })

  useEffect(() => {
    if (!organizationId) return
    fetchOrgTags(organizationId)
      .then((data) => setTags(data.tags ?? []))
      .catch(() => setTags([]))
  }, [organizationId])

  async function runSearch(e) {
    e?.preventDefault?.()
    if (!organizationId) return
    const hasCriteria =
      q.trim() ||
      status ||
      priority ||
      channel ||
      assignee ||
      tag ||
      dateFrom ||
      dateTo
    if (!hasCriteria) {
      setError('Enter a query or choose at least one filter.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await searchWorkspace(organizationId, {
        q: q.trim() || undefined,
        status: status || undefined,
        priority: priority || undefined,
        channel: channel || undefined,
        assignee: assignee || undefined,
        tag: tag || undefined,
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
        entityType,
        pageSize: 25,
      })
      setResults(data)
    } catch (err) {
      setResults(null)
      setError(err.message || 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  const selectClass =
    'rounded-lg border border-[#334060] bg-[#0e1526] px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#4f6290]'

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0f1422] text-slate-100">
      <div className="grid h-full min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] gap-0 overflow-hidden">
        <InboxSidebar
          activeFilter={activeFilter}
          filterCounts={filterCounts}
          onSelectPrimaryFilter={(filter) => {
            hookSelectPrimary(filter)
            goInboxFilter(filter)
          }}
          mentionCue={mentionCue}
        />
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#101729]">
          <div className="shrink-0 border-b border-[#27314a] px-6 py-5">
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
              <Search size={24} className="text-slate-300" aria-hidden />
              Search
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Filter conversations by status, assignee, tags, and more. Use tokens like{' '}
              <code className="text-slate-300">status:open assignee:me</code> in the query box.
            </p>
          </div>
          <div className="inbox-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 [scrollbar-gutter:stable]">
            <form className="mx-auto max-w-3xl space-y-4" onSubmit={(ev) => void runSearch(ev)}>
              <input
                type="search"
                value={q}
                onChange={(ev) => setQ(ev.target.value)}
                placeholder="Search or use filters — e.g. status:open tag:billing refund"
                className="w-full rounded-lg border border-[#334060] bg-[#0e1526] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#4f6290]"
                autoFocus
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <select
                  value={status}
                  onChange={(ev) => setStatus(ev.target.value)}
                  className={selectClass}
                  aria-label="Status"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value || 'any'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={priority}
                  onChange={(ev) => setPriority(ev.target.value)}
                  className={selectClass}
                  aria-label="Priority"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value || 'any'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={channel}
                  onChange={(ev) => setChannel(ev.target.value)}
                  className={selectClass}
                  aria-label="Channel"
                >
                  {CHANNEL_OPTIONS.map((opt) => (
                    <option key={opt.value || 'any'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={assignee}
                  onChange={(ev) => setAssignee(ev.target.value)}
                  className={selectClass}
                  aria-label="Assignee"
                >
                  {ASSIGNEE_OPTIONS.map((opt) => (
                    <option key={opt.value || 'any'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={tag}
                  onChange={(ev) => setTag(ev.target.value)}
                  className={selectClass}
                  aria-label="Tag"
                >
                  <option value="">Any tag</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  value={entityType}
                  onChange={(ev) => setEntityType(ev.target.value)}
                  className={selectClass}
                  aria-label="Result type"
                >
                  <option value="all">All types</option>
                  <option value="conversation">Conversations only</option>
                  <option value="message">Messages only</option>
                  <option value="customer">Customers only</option>
                </select>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(ev) => setDateFrom(ev.target.value)}
                  className={selectClass}
                  aria-label="Active since"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(ev) => setDateTo(ev.target.value)}
                  className={selectClass}
                  aria-label="Active until"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563eb] disabled:opacity-60"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  Search
                </button>
                {error ? <p className="text-sm text-red-400">{error}</p> : null}
              </div>
            </form>

            {results ? (
              <div className="mx-auto mt-8 max-w-3xl">
                <p className="mb-3 text-sm text-slate-400">
                  {results.pagination?.total ?? results.results?.length ?? 0} result
                  {(results.pagination?.total ?? 0) === 1 ? '' : 's'}
                  {results.query ? (
                    <>
                      {' '}
                      for <span className="text-slate-200">{results.query}</span>
                    </>
                  ) : null}
                </p>
                {results.results?.length ? (
                  <ul className="divide-y divide-[#27314a] rounded-lg border border-[#27314a] bg-[#0e1526]">
                    {results.results.map((row) => {
                      const link = resultLink(organizationId, row)
                      const inner = (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ENTITY_BADGE[row.entityType] ?? 'bg-slate-700'}`}
                              >
                                {row.entityType}
                              </span>
                              <span className="truncate font-medium text-white">{row.title}</span>
                            </div>
                            {row.snippet ? (
                              <p className="mt-1 line-clamp-2 text-sm text-slate-400">{row.snippet}</p>
                            ) : null}
                          </div>
                          {row.metadata?.status ? (
                            <span className="shrink-0 text-xs text-slate-500">{row.metadata.status}</span>
                          ) : null}
                        </div>
                      )
                      return (
                        <li key={`${row.entityType}-${row.entityId}`}>
                          {link ? (
                            link.external ? (
                              <a
                                href={link.href}
                                className="block px-4 py-3 hover:bg-[#151d30]"
                              >
                                {inner}
                              </a>
                            ) : (
                              <Link to={link.href} className="block px-4 py-3 hover:bg-[#151d30]">
                                {inner}
                              </Link>
                            )
                          ) : (
                            <div className="px-4 py-3">{inner}</div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-[#334060] px-4 py-8 text-center text-sm text-slate-500">
                    No matches. Try different filters or query tokens.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}
