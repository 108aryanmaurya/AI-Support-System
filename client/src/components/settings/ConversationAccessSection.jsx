import { ChevronDown, Search } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchOrgInboxes } from '../../services/inboxesApi.js'

/**
 * @param {object} props
 * @param {object} props.conversationAccess — merged conversationAccess
 * @param {(next: object) => void} props.onChange
 * @param {boolean} [props.readOnly]
 * @param {string} [props.orgId] — loads team inboxes for “Select team”
 */
export function ConversationAccessSection({
  conversationAccess,
  onChange,
  readOnly = false,
  orgId,
}) {
  const mode = conversationAccess.mode ?? 'all'
  const [teamsOpen, setTeamsOpen] = useState(false)
  const [teamSearch, setTeamSearch] = useState('')
  const [inboxes, setInboxes] = useState([])
  const [inboxesLoading, setInboxesLoading] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 288 })
  const teamsAnchorRef = useRef(null)
  const teamsPanelRef = useRef(null)

  const loadInboxes = useCallback(async () => {
    if (!orgId) return
    setInboxesLoading(true)
    try {
      const data = await fetchOrgInboxes(orgId)
      const list = Array.isArray(data?.inboxes) ? data.inboxes : []
      setInboxes(list.filter((ib) => ib.status === 'active'))
    } catch {
      setInboxes([])
    } finally {
      setInboxesLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    if (orgId) void loadInboxes()
  }, [orgId, loadInboxes])

  const updateMenuPosition = useCallback(() => {
    const el = teamsAnchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = 288
    const padding = 8
    let left = rect.left
    if (left + width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - width - padding)
    }
    setMenuPosition({
      top: rect.bottom + 4,
      left,
      width,
    })
  }, [])

  useLayoutEffect(() => {
    if (!teamsOpen) return
    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [teamsOpen, updateMenuPosition])

  useEffect(() => {
    if (!teamsOpen) return
    function handlePointerDown(e) {
      const target = e.target
      if (!(target instanceof Node)) return
      if (teamsAnchorRef.current?.contains(target)) return
      if (teamsPanelRef.current?.contains(target)) return
      setTeamsOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [teamsOpen])

  const exceptTeamIds = Array.isArray(conversationAccess.exceptTeamIds)
    ? conversationAccess.exceptTeamIds
    : []

  const filteredInboxes = useMemo(() => {
    const q = teamSearch.trim().toLowerCase()
    if (!q) return inboxes
    return inboxes.filter((ib) => (ib.name ?? '').toLowerCase().includes(q))
  }, [inboxes, teamSearch])

  const selectedTeamSummary = useMemo(() => {
    if (exceptTeamIds.length === 0) return ''
    const names = exceptTeamIds
      .map((id) => inboxes.find((ib) => ib.id === id)?.name)
      .filter(Boolean)
    if (names.length <= 2) return names.join(', ')
    return `${names.length} teams selected`
  }, [exceptTeamIds, inboxes])

  function patchConversationAccess(patch) {
    if (readOnly) return
    onChange({ ...conversationAccess, ...patch })
  }

  function setMode(nextMode) {
    patchConversationAccess({ mode: nextMode })
    if (nextMode !== 'all_except_teams') {
      setTeamsOpen(false)
    }
  }

  function toggleExceptTeam(inboxId) {
    if (readOnly) return
    const set = new Set(exceptTeamIds)
    if (set.has(inboxId)) set.delete(inboxId)
    else set.add(inboxId)
    patchConversationAccess({
      mode: 'all_except_teams',
      exceptTeamIds: [...set],
    })
  }

  function openTeamsMenu() {
    if (readOnly || !orgId) return
    if (!teamsOpen) void loadInboxes()
    setTeamsOpen((open) => !open)
  }

  const options = [
    { value: 'all', label: 'All conversations' },
    {
      value: 'assigned_to_me',
      label: 'Conversations assigned to them only',
      subCheckbox: {
        key: 'includeUnassignedForAssignedToMe',
        label: 'Include unassigned conversations',
        checked: Boolean(conversationAccess.includeUnassignedForAssignedToMe),
      },
    },
    {
      value: 'assigned_to_my_teams',
      label: 'Conversations assigned to their teams only',
      subCheckbox: {
        key: 'includeUnassignedForAssignedToTeams',
        label: 'Include unassigned conversations',
        checked: Boolean(conversationAccess.includeUnassignedForAssignedToTeams),
      },
    },
    {
      value: 'all_except_teams',
      label: 'All conversations except assigned to',
      teamPicker: true,
    },
    {
      value: 'mentions_only',
      label: 'Conversations accessed via @ mentions or URL links only',
      disabled: true,
    },
  ]

  const teamsMenu =
    teamsOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={teamsPanelRef}
            role="listbox"
            aria-label="Select teams"
            style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-lg border border-[#2b3858] bg-[#151b2e] shadow-2xl"
          >
            <div className="border-b border-[#2b3858] p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  placeholder="Search teams…"
                  className="w-full rounded-md border border-[#2b3858] bg-[#111827] py-1.5 pl-8 pr-2 text-xs text-white placeholder:text-slate-600 focus:border-[#3ECF8E]/40 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
            <ul className="max-h-52 overflow-y-auto py-1">
              {inboxesLoading ? (
                <li className="px-3 py-2 text-xs text-slate-500">Loading teams…</li>
              ) : filteredInboxes.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500">
                  {orgId ? 'No team inboxes found.' : 'Team list unavailable.'}
                </li>
              ) : (
                filteredInboxes.map((ib) => {
                  const selected = exceptTeamIds.includes(ib.id)
                  return (
                    <li key={ib.id}>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => toggleExceptTeam(ib.id)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-[#1e293b] ${
                          selected ? 'bg-[#1e293b]/80 text-white' : 'text-slate-300'
                        }`}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#2b3858] text-xs font-semibold text-slate-300"
                          aria-hidden
                        >
                          {(ib.name ?? '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{ib.name}</span>
                        <input
                          type="checkbox"
                          readOnly
                          checked={selected}
                          className="pointer-events-none rounded border-slate-600"
                          tabIndex={-1}
                        />
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <ul className="space-y-3">
        {options.map((opt) => (
          <li key={opt.value}>
            <div
              className={`flex items-start gap-3 text-sm ${
                opt.disabled || readOnly ? 'text-slate-600' : 'text-slate-300'
              }`}
            >
              <input
                type="radio"
                id={`conv-access-${opt.value}`}
                name="conversation-access"
                value={opt.value}
                checked={mode === opt.value}
                disabled={opt.disabled || readOnly}
                onChange={() => !opt.disabled && !readOnly && setMode(opt.value)}
                className="mt-1 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <div className="min-w-0 flex-1">
                {opt.teamPicker ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <label
                      htmlFor={`conv-access-${opt.value}`}
                      className={`cursor-pointer ${
                        opt.disabled || readOnly ? 'cursor-not-allowed' : ''
                      }`}
                    >
                      {opt.label}
                    </label>
                    <button
                      ref={teamsAnchorRef}
                      type="button"
                      disabled={readOnly || !orgId}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openTeamsMenu()
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-orange-400 hover:text-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Select teams
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition ${teamsOpen ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </button>
                    {selectedTeamSummary ? (
                      <span className="text-xs text-slate-500">({selectedTeamSummary})</span>
                    ) : null}
                  </div>
                ) : (
                  <label
                    htmlFor={`conv-access-${opt.value}`}
                    className={`block cursor-pointer ${
                      opt.disabled || readOnly ? 'cursor-not-allowed' : ''
                    }`}
                  >
                    {opt.label}
                  </label>
                )}
                {opt.subCheckbox && mode === opt.value ? (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={opt.subCheckbox.checked}
                      disabled={readOnly}
                      onChange={(e) =>
                        patchConversationAccess({ [opt.subCheckbox.key]: e.target.checked })
                      }
                      className="mt-0.5 rounded border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span>{opt.subCheckbox.label}</span>
                  </label>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {teamsMenu}
    </>
  )
}
