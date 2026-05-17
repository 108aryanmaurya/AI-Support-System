import {
  ChevronDown,
  ChevronRight,
  Flame,
  Folder,
  Handshake,
  HelpCircle,
  ListFilter,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  UserRoundPlus,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { INBOX_SIDEBAR_FILTERS } from '../config/inboxFilters.js'

const finForServiceOptions = [
  { label: 'All conversations', icon: ListFilter },
  { label: 'Resolved', icon: Folder },
  { label: 'Needs teammate input', icon: UserRoundPlus },
  { label: 'Escalated & Handoff', icon: Handshake },
  { label: 'Pending', icon: HelpCircle },
  { label: 'Spam', icon: ShieldAlert },
]

const viewOptions = [
  { label: 'Messenger', count: 1 },
  { label: 'Email', count: 1 },
  { label: 'WhatsApp & Social', count: 1 },
  { label: 'Phone & SMS', count: 1 },
  { label: 'Tickets', count: 0 },
]

/**
 * Left navigation rail for the org inbox workspace (filters, Fin, views).
 */
export function InboxSidebar({
  activeFilter,
  filterCounts,
  onSelectSidebarFilter,
  mentionCue,
  autoAssignOnSelect,
  setAutoAssignOnSelect,
  orgTags = [],
  activeTagId = null,
  onTagFilterChange,
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
        <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-lg border border-[#27314a] bg-[#0e1526] px-2 py-2 text-xs text-slate-400">
          <input
            type="checkbox"
            className="rounded border-[#4f6290] bg-[#0f1728]"
            checked={autoAssignOnSelect}
            onChange={(e) => setAutoAssignOnSelect(e.target.checked)}
          />
          <span>Auto-assign when opening</span>
        </label>
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
        </div>

        <div className="mt-4 rounded-lg border border-[#27314a] bg-[#0f1728] p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-white">Fin for Service</p>
            <div className="flex items-center gap-1 text-slate-400">
              <button type="button" className="rounded-md p-1 hover:bg-[#1a2440]">
                <Plus size={12} />
              </button>
              <ChevronDown size={12} />
            </div>
          </div>
          <div className="space-y-0.5">
            {finForServiceOptions.map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-300">
                <item.icon size={13} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between px-1 text-xs text-slate-400">
          <span>Team inboxes</span>
          <span className="inline-flex items-center gap-1">
            <Plus size={12} />
            <ChevronRight size={12} />
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-xs text-slate-400">
          <span>Teammates</span>
          <span className="inline-flex items-center gap-1">
            <Plus size={12} />
            <ChevronRight size={12} />
          </span>
        </div>

        <div className="mt-5 border-t border-[#27314a] pt-3 text-xs text-slate-400">Views</div>
        <div className="mt-2 space-y-1 text-sm">
          {viewOptions.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-md px-2 py-1.5 text-slate-300">
              <span className="inline-flex items-center gap-2">
                <Flame size={13} className="text-slate-400" />
                {item.label}
              </span>
              <span className="text-xs text-slate-400">{item.count}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 rounded-lg border border-[#334060] bg-[#1b2741] p-2 text-sm">
          <p className="font-semibold text-white">Get set up</p>
          <p className="mt-1 text-xs text-slate-300">Set up channels to connect with your customers</p>
        </div>
      </div>
    </aside>
  )
}
