import {
  Search,
  Sparkles,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { INBOX_AI_INTENT_OPTIONS, INBOX_SIDEBAR_FILTERS } from '../config/inboxFilters.js'
import { RestrictedControl } from './RestrictedControl.jsx'

/**
 * Left navigation rail for the org inbox workspace (filters, Fin, views).
 */
export function InboxSidebar({
  activeFilter,
  filterCounts,
  onSelectSidebarFilter,
  mentionCue,
  orgTags = [],
  activeTagId = null,
  onTagFilterChange,
  activeAiIntent = null,
  onAiIntentFilterChange,
}) {
  const { orgId } = useParams()
  const navigate = useNavigate()

  const openSearch = () => {
    if (typeof orgId === 'string' && orgId.trim()) {
      navigate(`/org/${orgId.trim()}/search`)
    }
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[#27314a] bg-[#121a2b]">
      <div className="inbox-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Inbox</h2>
          <button type="button" className="rounded-md bg-[#1b2741] p-1.5">
            <Sparkles size={14} />
          </button>
        </div>
        <button
          type="button"
          onClick={openSearch}
          className="mb-3 flex w-full cursor-pointer items-center gap-2 rounded-lg bg-[#0e1526] px-2 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-[#151e33]"
        >
          <Search size={14} aria-hidden /> Search
        </button>
     
        <div className="space-y-1 text-sm">
          {INBOX_SIDEBAR_FILTERS.map((item) => {
            const isActive = activeFilter === item.id
            const count = filterCounts[item.id] ?? 0
            const mentionFlash = item.id === 'mentions' && mentionCue
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSidebarFilter(item.id)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors ${
                  isActive ? 'bg-[#1a2440] text-white' : 'text-slate-300 hover:bg-[#151e33]'
                } ${mentionFlash ? 'shadow-[0_0_14px_rgba(56,189,248,0.35)] ring-2 ring-sky-400/80' : ''}`}
              >
                <span>{item.label}</span>
                <span className="tabular-nums text-xs text-slate-400">{count}</span>
              </button>
            )
          })}
          <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-slate-400">
            <span>Dashboard</span>
          </div>
          {orgTags.length > 0 && onTagFilterChange ? (
            <label className="mt-2 block px-1 text-xs text-slate-500">
              Filter by tag
              <select
                value={activeTagId ?? ''}
                onChange={(e) => onTagFilterChange(e.target.value || null)}
                className="mt-1 w-full rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1.5 text-sm text-white outline-none"
              >
                <option value="">All tags</option>
                {orgTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {activeFilter === 'ai_intent' && onAiIntentFilterChange ? (
            <label className="mt-2 block px-1 text-xs text-slate-500">
              AI intent
              <select
                value={activeAiIntent ?? INBOX_AI_INTENT_OPTIONS[0]?.value ?? ''}
                onChange={(e) => onAiIntentFilterChange(e.target.value || null)}
                className="mt-1 w-full rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1.5 text-sm text-white outline-none"
              >
                {INBOX_AI_INTENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

       
      </div>
    </aside>
  )
}
