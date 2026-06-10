import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BookmarkPlus, Loader2, Search, Trash2 } from 'lucide-react'
import { InboxSidebar } from '../components/InboxSidebar.jsx'
import { useInboxSidebarActions } from '../hooks/useInboxSidebarActions.js'
import {
  deleteSavedSearch,
  listSavedSearches,
  saveSearch,
} from '../lib/savedSearchStorage.js'
import { apiFetch } from '../services/api.js'
import { conversationMembersUrl } from '../services/inboxApi.js'
import { searchWorkspaceAdvanced } from '../services/searchApi.js'
import { fetchOrgTags } from '../services/tagsApi.js'

const STATUS_OPTIONS = ['open', 'pending', 'resolved', 'closed']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent']
const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'web', label: 'Web' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'messenger', label: 'Messenger' },
]

const ENTITY_BADGE = {
  conversation: 'bg-[#2a3f6b] text-slate-100',
  message: 'bg-[#3d2f5c] text-slate-100',
  customer: 'bg-[#1f4d3a] text-slate-100',
}

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function FilterChipGroup({ label, options, selected, onToggle }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const value = typeof opt === 'string' ? opt : opt.value
          const text = typeof opt === 'string' ? opt : opt.label
          const active = selected.includes(value)
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-[#3b82f6] bg-[#1e3a5f] text-white'
                  : 'border-[#334060] bg-[#0e1526] text-slate-300 hover:border-[#4f6290]'
              }`}
            >
              {text}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Render FTS snippet with optional `<mark>` highlights from ts_headline. */
function HighlightSnippet({ text }) {
  if (!text || typeof text !== 'string') return null
  if (!text.includes('<mark>')) return text

  const nodes = []
  let inMark = false
  for (const part of text.split(/(<\/?mark>)/)) {
    if (part === '<mark>') {
      inMark = true
      continue
    }
    if (part === '</mark>') {
      inMark = false
      continue
    }
    if (!part) continue
    nodes.push(
      inMark ? (
        <mark key={nodes.length} className="rounded bg-amber-400/25 px-0.5 text-amber-100">
          {part}
        </mark>
      ) : (
        <span key={nodes.length}>{part}</span>
      ),
    )
  }
  return nodes
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

function FacetSection({ title, items, memberLabels }) {
  if (!items?.length) return null
  return (
    <div className="mb-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="space-y-1 text-sm text-slate-300">
        {items.map((item) => {
          const label =
            title === 'Assignee'
              ? memberLabels?.[item.value] ??
                (item.value === 'unassigned' ? 'Unassigned' : item.label)
              : item.label
          return (
            <li key={`${title}-${item.value}`} className="flex justify-between gap-2">
              <span className="truncate">{label}</span>
              <span className="shrink-0 text-slate-500">{item.count}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function InboxSearchPage() {
  const { orgId: orgFromRoute } = useParams()
  const navigate = useNavigate()
  const organizationId =
    (typeof orgFromRoute === 'string' && orgFromRoute.trim()) ||
    ''

  const [q, setQ] = useState('')
  const [statuses, setStatuses] = useState([])
  const [priorities, setPriorities] = useState([])
  const [channels, setChannels] = useState([])
  const [assignees, setAssignees] = useState([])
  const [selectedTags, setSelectedTags] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [slaAtRisk, setSlaAtRisk] = useState(false)
  const [entityType, setEntityType] = useState('all')
  const [orgTags, setOrgTags] = useState([])
  const [members, setMembers] = useState([])
  const [savedSearches, setSavedSearches] = useState([])
  const [saveName, setSaveName] = useState('')
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

  const memberLabels = Object.fromEntries(
    members.map((m) => [m.id, m.displayName || m.email || m.id]),
  )
  memberLabels.unassigned = 'Unassigned'
  memberLabels.me = 'Assigned to me'

  useEffect(() => {
    if (!organizationId) return
    fetchOrgTags(organizationId)
      .then((data) => setOrgTags(data.tags ?? []))
      .catch(() => setOrgTags([]))
    apiFetch(conversationMembersUrl(organizationId))
      .then((data) => setMembers(data.members ?? []))
      .catch(() => setMembers([]))
    setSavedSearches(listSavedSearches(organizationId))
  }, [organizationId])

  function buildPayload() {
    return {
      query: q.trim() || undefined,
      status: statuses.length ? statuses : undefined,
      priority: priorities.length ? priorities : undefined,
      channel: channels.length ? channels : undefined,
      assignee: assignees.length ? assignees : undefined,
      tags: selectedTags.length ? selectedTags : undefined,
      slaAtRisk: slaAtRisk || undefined,
      dateRange:
        dateFrom || dateTo
          ? {
              from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
              to: dateTo ? new Date(dateTo).toISOString() : undefined,
            }
          : undefined,
      entityType,
      includeFacets: true,
      pageSize: 25,
    }
  }

  function applyPayload(payload) {
    setQ(typeof payload.query === 'string' ? payload.query : '')
    setStatuses(Array.isArray(payload.status) ? payload.status : [])
    setPriorities(Array.isArray(payload.priority) ? payload.priority : [])
    setChannels(Array.isArray(payload.channel) ? payload.channel : [])
    setAssignees(Array.isArray(payload.assignee) ? payload.assignee : [])
    setSelectedTags(Array.isArray(payload.tags) ? payload.tags : [])
    setSlaAtRisk(payload.slaAtRisk === true)
    setEntityType(typeof payload.entityType === 'string' ? payload.entityType : 'all')
    const dr = payload.dateRange
    if (dr && typeof dr === 'object') {
      setDateFrom(dr.from ? dr.from.slice(0, 10) : '')
      setDateTo(dr.to ? dr.to.slice(0, 10) : '')
    } else {
      setDateFrom('')
      setDateTo('')
    }
  }

  async function runSearch(e) {
    e?.preventDefault?.()
    if (!organizationId) return
    const payload = buildPayload()
    const hasCriteria =
      payload.query ||
      payload.status ||
      payload.priority ||
      payload.channel ||
      payload.assignee ||
      payload.tags ||
      payload.slaAtRisk ||
      payload.dateRange
    if (!hasCriteria) {
      setError('Enter a query or choose at least one filter.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await searchWorkspaceAdvanced(organizationId, payload)
      setResults(data)
    } catch (err) {
      setResults(null)
      setError(err.message || 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  function handleSaveSearch() {
    if (!organizationId) return
    const entry = saveSearch(organizationId, saveName, buildPayload())
    if (entry) {
      setSavedSearches(listSavedSearches(organizationId))
      setSaveName('')
    }
  }

  const selectClass =
    'rounded-lg border border-[#334060] bg-[#0e1526] px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#4f6290]'

  const assigneeOptions = [
    { value: 'me', label: 'Assigned to me' },
    { value: 'unassigned', label: 'Unassigned' },
    ...members.map((m) => ({
      value: m.id,
      label: m.displayName || m.email || 'Teammate',
    })),
  ]

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
              Advanced filters with multi-select chips. Use tokens like{' '}
              <code className="text-slate-300">status:open assignee:me</code> in the query box.
            </p>
          </div>
          <div className="inbox-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 [scrollbar-gutter:stable]">
            <form className="mx-auto max-w-4xl space-y-5" onSubmit={(ev) => void runSearch(ev)}>
              <input
                type="search"
                value={q}
                onChange={(ev) => setQ(ev.target.value)}
                placeholder="Search — e.g. refund failed payment"
                className="w-full rounded-lg border border-[#334060] bg-[#0e1526] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#4f6290]"
                autoFocus
              />

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-4 rounded-lg border border-[#27314a] bg-[#0e1526] p-4">
                  <FilterChipGroup
                    label="Status"
                    options={STATUS_OPTIONS}
                    selected={statuses}
                    onToggle={(v) => setStatuses((prev) => toggleValue(prev, v))}
                  />
                  <FilterChipGroup
                    label="Priority"
                    options={PRIORITY_OPTIONS}
                    selected={priorities}
                    onToggle={(v) => setPriorities((prev) => toggleValue(prev, v))}
                  />
                  <FilterChipGroup
                    label="Channel"
                    options={CHANNEL_OPTIONS}
                    selected={channels}
                    onToggle={(v) => setChannels((prev) => toggleValue(prev, v))}
                  />
                  <FilterChipGroup
                    label="Assignee"
                    options={assigneeOptions}
                    selected={assignees}
                    onToggle={(v) => setAssignees((prev) => toggleValue(prev, v))}
                  />
                  {orgTags.length ? (
                    <FilterChipGroup
                      label="Tags"
                      options={orgTags.map((t) => ({ value: t.name, label: t.name }))}
                      selected={selectedTags}
                      onToggle={(v) => setSelectedTags((prev) => toggleValue(prev, v))}
                    />
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-slate-500">
                      Active since
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(ev) => setDateFrom(ev.target.value)}
                        className={`${selectClass} mt-1 w-full`}
                      />
                    </label>
                    <label className="block text-xs text-slate-500">
                      Active until
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(ev) => setDateTo(ev.target.value)}
                        className={`${selectClass} mt-1 w-full`}
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={slaAtRisk}
                      onChange={(ev) => setSlaAtRisk(ev.target.checked)}
                      className="rounded border-[#334060]"
                    />
                    SLA at risk (waiting on agent)
                  </label>
                  <select
                    value={entityType}
                    onChange={(ev) => setEntityType(ev.target.value)}
                    className={selectClass}
                    aria-label="Result type"
                  >
                    <option value="all">All result types</option>
                    <option value="conversation">Conversations only</option>
                    <option value="message">Messages only</option>
                    <option value="customer">Customers only</option>
                  </select>
                </div>

                <aside className="rounded-lg border border-[#27314a] bg-[#0e1526] p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Saved searches
                  </p>
                  {savedSearches.length ? (
                    <ul className="mb-3 space-y-2">
                      {savedSearches.map((item) => (
                        <li key={item.id} className="flex items-center gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left text-sm text-slate-200 hover:text-white"
                            onClick={() => {
                              applyPayload(item.payload)
                              void runSearch()
                            }}
                          >
                            {item.name}
                          </button>
                          <button
                            type="button"
                            aria-label="Delete saved search"
                            className="text-slate-500 hover:text-red-400"
                            onClick={() => {
                              deleteSavedSearch(organizationId, item.id)
                              setSavedSearches(listSavedSearches(organizationId))
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-3 text-xs text-slate-500">No saved searches yet.</p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={saveName}
                      onChange={(ev) => setSaveName(ev.target.value)}
                      placeholder="Name this search"
                      className={`${selectClass} min-w-0 flex-1`}
                    />
                    <button
                      type="button"
                      disabled={!saveName.trim()}
                      onClick={handleSaveSearch}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#334060] px-2 py-2 text-xs text-slate-200 hover:bg-[#151d30] disabled:opacity-50"
                    >
                      <BookmarkPlus size={14} />
                      Save
                    </button>
                  </div>
                </aside>
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
              <div className="mx-auto mt-8 grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_200px]">
                <div>
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
                                <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                                  <HighlightSnippet text={row.snippet} />
                                </p>
                              ) : null}
                            </div>
                            {row.metadata?.status ? (
                              <span className="shrink-0 text-xs text-slate-500">
                                {row.metadata.status}
                              </span>
                            ) : null}
                          </div>
                        )
                        return (
                          <li key={`${row.entityType}-${row.entityId}`}>
                            {link ? (
                              link.external ? (
                                <a href={link.href} className="block px-4 py-3 hover:bg-[#151d30]">
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

                {results.facets ? (
                  <aside className="rounded-lg border border-[#27314a] bg-[#0e1526] p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Facets
                    </p>
                    <FacetSection title="Status" items={results.facets.status} />
                    <FacetSection title="Priority" items={results.facets.priority} />
                    <FacetSection title="Channel" items={results.facets.channel} />
                    <FacetSection
                      title="Assignee"
                      items={results.facets.assignee}
                      memberLabels={memberLabels}
                    />
                    <FacetSection title="Tags" items={results.facets.tag} />
                  </aside>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}
