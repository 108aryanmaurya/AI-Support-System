import {
  AtSign,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Hexagon,
  Inbox,
  LifeBuoy,
  Pencil,
  Plus,
  Search,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { INBOX_SIDEBAR_FILTERS, INBOX_SIDEBAR_SECTIONS } from '../config/inboxFilters.js'

const FILTER_ICONS = {
  inbox: CircleUserRound,
  mentions: AtSign,
  created_by: Pencil,
  unassigned: LifeBuoy,
  spam: Hexagon,
}

/**
 * Left navigation rail for the org inbox workspace.
 */
export function InboxSidebar({
  activeFilter,
  filterCounts,
  onSelectPrimaryFilter,
  onSelectTeamInbox,
  onSelectTeammate,
  onSelectChannel,
  mentionCue,
  teamInboxes = [],
  teammates = [],
  channels = [],
  activeInboxId = '',
  activeMemberId = '',
  activeChannelId = '',
}) {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState({
    team_inboxes: false,
    teammates: false,
    views: false,
  })

  const openSearch = () => {
    if (typeof orgId === 'string' && orgId.trim()) {
      navigate(`/org/${orgId.trim()}/search`)
    }
  }

  const toggleSection = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const activeSection = useMemo(() => {
    if (activeFilter === 'team_inbox') return 'team_inboxes'
    if (activeFilter === 'teammate') return 'teammates'
    if (activeFilter === 'channel') return 'views'
    return null
  }, [activeFilter])

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[#27314a] bg-[#121a2b]">
      <div className="inbox-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Inbox</h2>
          <button
            type="button"
            className="rounded-md bg-[#1b2741] p-1.5 text-slate-300 hover:text-white"
            aria-label="New conversation"
          >
            <Plus size={14} />
          </button>
        </div>
        <button
          type="button"
          onClick={openSearch}
          className="mb-3 flex w-full cursor-pointer items-center gap-2 rounded-lg bg-[#0e1526] px-2 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-[#151e33]"
        >
          <Search size={14} aria-hidden /> Search
        </button>

        <div className="space-y-0.5 text-sm">
          {INBOX_SIDEBAR_FILTERS.map((item) => {
            const Icon = FILTER_ICONS[item.id] ?? Inbox
            const isActive = activeFilter === item.id
            const count =
              filterCounts[item.id] ?? filterCounts.created_by_you ?? 0
            const mentionFlash = item.id === 'mentions' && mentionCue
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectPrimaryFilter(item.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  isActive ? 'bg-[#1a2440] text-white' : 'text-slate-300 hover:bg-[#151e33]'
                } ${mentionFlash ? 'shadow-[0_0_14px_rgba(56,189,248,0.35)] ring-2 ring-sky-400/80' : ''}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  <span>{item.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-xs text-slate-400">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 space-y-1 border-t border-[#27314a] pt-3 text-sm">
          {INBOX_SIDEBAR_SECTIONS.map((section) => {
            const isOpen = expanded[section.id] || activeSection === section.id
            const isSectionActive = activeSection === section.id
            return (
              <div key={section.id}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors ${
                    isSectionActive ? 'text-white' : 'text-slate-400 hover:bg-[#151e33] hover:text-slate-200'
                  }`}
                >
                  <span className="font-medium">{section.label}</span>
                  <span className="flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5 opacity-50" aria-hidden />
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                </button>
                {isOpen ? (
                  <ul className="mb-1 ml-2 max-h-40 space-y-0.5 overflow-y-auto border-l border-[#2b3858] pl-2">
                    {section.id === 'team_inboxes' &&
                      (teamInboxes.length === 0 ? (
                        <li className="px-2 py-1 text-xs text-slate-500">No team inboxes</li>
                      ) : (
                        teamInboxes.map((ib) => (
                          <li key={ib.id}>
                            <button
                              type="button"
                              onClick={() => onSelectTeamInbox(ib.id)}
                              className={`w-full truncate rounded px-2 py-1 text-left text-xs ${
                                activeFilter === 'team_inbox' && activeInboxId === ib.id
                                  ? 'bg-[#1a2440] text-white'
                                  : 'text-slate-400 hover:bg-[#151e33] hover:text-slate-200'
                              }`}
                            >
                              {ib.name}
                            </button>
                          </li>
                        ))
                      ))}
                    {section.id === 'teammates' &&
                      (teammates.length === 0 ? (
                        <li className="px-2 py-1 text-xs text-slate-500">No teammates</li>
                      ) : (
                        teammates.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => onSelectTeammate(m.id)}
                              className={`w-full truncate rounded px-2 py-1 text-left text-xs ${
                                activeFilter === 'teammate' && activeMemberId === m.id
                                  ? 'bg-[#1a2440] text-white'
                                  : 'text-slate-400 hover:bg-[#151e33] hover:text-slate-200'
                              }`}
                            >
                              {m.displayName || m.email || m.id}
                            </button>
                          </li>
                        ))
                      ))}
                    {section.id === 'views' &&
                      (channels.length === 0 ? (
                        <li className="px-2 py-1 text-xs text-slate-500">No channels</li>
                      ) : (
                        channels.map((ch) => (
                          <li key={ch.id}>
                            <button
                              type="button"
                              onClick={() => onSelectChannel(ch.id)}
                              className={`w-full truncate rounded px-2 py-1 text-left text-xs ${
                                activeFilter === 'channel' && activeChannelId === ch.id
                                  ? 'bg-[#1a2440] text-white'
                                  : 'text-slate-400 hover:bg-[#151e33] hover:text-slate-200'
                              }`}
                            >
                              {ch.name || ch.type || ch.id}
                            </button>
                          </li>
                        ))
                      ))}
                  </ul>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
