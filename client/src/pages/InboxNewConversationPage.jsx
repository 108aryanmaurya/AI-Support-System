import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, Mail, MessageSquare, Plus, X } from 'lucide-react'
import { InboxSidebar } from '../components/InboxSidebar.jsx'
import { apiFetch } from '../services/api.js'
import { fetchOrgInboxes } from '../services/inboxesApi.js'
import { fetchOrgChannels } from '../services/orgWorkspaceApi.js'
import { fetchOrgEmailSettings } from '../services/orgEmailSettingsApi.js'
import { fetchOrgCustomers } from '../services/customersApi.js'
import { useAuth } from '../hooks/useAuth.js'
import { conversationMembersUrl } from '../services/inboxApi.js'

function uniqEmails(list) {
  const seen = new Set()
  const out = []
  for (const raw of list ?? []) {
    const e = String(raw ?? '').trim().toLowerCase()
    if (!e) continue
    if (!seen.has(e)) {
      seen.add(e)
      out.push(e)
    }
  }
  return out
}

function EmailPillsInput({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  autoFocus,
  rightAddon,
}) {
  const [draft, setDraft] = useState('')
  const list = useMemo(() => uniqEmails(value), [value])
  const filteredSuggestions = useMemo(() => {
    const q = draft.trim().toLowerCase()
    const base = (suggestions ?? []).filter((s) => s && s.email)
    const matches = !q
      ? base
      : base.filter((s) => {
          const email = String(s.email || '').toLowerCase()
          const name = String(s.name || '').toLowerCase()
          return email.includes(q) || name.includes(q)
        })
    const picked = new Set(list)
    return matches.filter((s) => !picked.has(String(s.email).toLowerCase())).slice(0, 12)
  }, [draft, suggestions, list])

  const addEmail = useCallback(
    (raw) => {
      const e = String(raw ?? '').trim().toLowerCase()
      if (!e) return
      const next = uniqEmails([...(list ?? []), e])
      onChange(next)
      setDraft('')
    },
    [list, onChange],
  )

  return (
    <div className="flex items-start gap-3 border-b border-[#2b3652] py-2">
      <div className="w-14 shrink-0 pt-1 text-xs text-slate-400">{label}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {list.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 rounded-full bg-[#24304b] px-2 py-1 text-xs text-slate-100"
            >
              <span className="max-w-[220px] truncate">{email}</span>
              <button
                type="button"
                className="rounded p-0.5 text-slate-300 hover:text-white"
                aria-label={`Remove ${email}`}
                onClick={() => onChange(list.filter((x) => x !== email))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            value={draft}
            autoFocus={autoFocus}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addEmail(draft)
              }
              if (e.key === 'Backspace' && !draft && list.length) {
                onChange(list.slice(0, -1))
              }
            }}
            placeholder={placeholder}
            className="min-w-[180px] flex-1 bg-transparent py-1 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          {rightAddon}
        </div>
        {filteredSuggestions.length ? (
          <div className="mt-2 overflow-hidden rounded-lg border border-[#334060] bg-[#0f1728]">
            {filteredSuggestions.map((s) => {
              const email = String(s.email || '').toLowerCase()
              return (
                <button
                  type="button"
                  key={s.id || email}
                  onClick={() => addEmail(email)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-slate-200 hover:bg-[#1a2440]"
                >
                  <span className="min-w-0 truncate">
                    {s.name ? <span className="text-slate-100">{s.name}</span> : null}
                    {s.name ? <span className="text-slate-500"> · </span> : null}
                    <span className="text-slate-300">{email}</span>
                  </span>
                  <Plus size={14} className="shrink-0 opacity-70" aria-hidden />
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function InboxNewConversationPage() {
  const { orgId: orgFromRoute } = useParams()
  const organizationId = (typeof orgFromRoute === 'string' && orgFromRoute.trim()) || ''
  const navigate = useNavigate()
  const { user } = useAuth()

  const [orgMembers, setOrgMembers] = useState([])
  const [orgInboxes, setOrgInboxes] = useState([])
  const [orgChannels, setOrgChannels] = useState([])
  const [customers, setCustomers] = useState([])
  const [emailSettings, setEmailSettings] = useState(null)

  const [channel, setChannel] = useState('email') // 'email' | 'chat'
  const [to, setTo] = useState([])
  const [ccOpen, setCcOpen] = useState(false)
  const [bccOpen, setBccOpen] = useState(false)
  const [cc, setCc] = useState([])
  const [bcc, setBcc] = useState([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sidebarTab, setSidebarTab] = useState('details')
  const [channelMenuOpen, setChannelMenuOpen] = useState(false)

  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false)
  const [teamInboxMenuOpen, setTeamInboxMenuOpen] = useState(false)
  const channelMenuRef = useRef(null)
  const assigneeMenuRef = useRef(null)
  const teamInboxMenuRef = useRef(null)

  const myMembership = useMemo(() => {
    const fromMembers = orgMembers.find((m) => m.userId === user?.id)
    return fromMembers ?? null
  }, [orgMembers, user?.id])

  const [assignedToMemberId, setAssignedToMemberId] = useState(null)
  const [teamInboxId, setTeamInboxId] = useState(null)

  useEffect(() => {
    if (!assignedToMemberId && myMembership?.id) {
      setAssignedToMemberId(myMembership.id)
    }
  }, [assignedToMemberId, myMembership?.id])

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      try {
        const [membersRes, inboxRes, channelRes, emailRes] = await Promise.all([
          apiFetch(conversationMembersUrl(organizationId)),
          fetchOrgInboxes(organizationId).catch(() => ({ inboxes: [] })),
          fetchOrgChannels(organizationId).catch(() => ({ channels: [] })),
          fetchOrgEmailSettings(organizationId).catch(() => null),
        ])
        if (cancelled) return
        setOrgMembers(membersRes?.members ?? [])
        setOrgInboxes((inboxRes?.inboxes ?? []).filter((ib) => ib.status === 'active'))
        setOrgChannels(channelRes?.channels ?? [])
        setEmailSettings(emailRes)
      } catch (e) {
        if (!cancelled) {
          setOrgMembers([])
          setOrgInboxes([])
          setOrgChannels([])
          setEmailSettings(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchOrgCustomers(organizationId, { limit: 60 })
        if (!cancelled) setCustomers(res?.items ?? [])
      } catch {
        if (!cancelled) setCustomers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  useEffect(() => {
    if (!assigneeMenuOpen) return undefined
    const onPointerDown = (event) => {
      if (assigneeMenuRef.current && !assigneeMenuRef.current.contains(event.target)) {
        setAssigneeMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [assigneeMenuOpen])

  useEffect(() => {
    if (!teamInboxMenuOpen) return undefined
    const onPointerDown = (event) => {
      if (teamInboxMenuRef.current && !teamInboxMenuRef.current.contains(event.target)) {
        setTeamInboxMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [teamInboxMenuOpen])

  useEffect(() => {
    if (!channelMenuOpen) return undefined
    const onPointerDown = (event) => {
      if (channelMenuRef.current && !channelMenuRef.current.contains(event.target)) {
        setChannelMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [channelMenuOpen])

  const fromLabel = useMemo(() => {
    if (channel === 'chat') {
      const sender =
        emailSettings?.outboundFromEmail || emailSettings?.displaySupportEmail || 'Support'
      return sender
    }
    const agentName =
      (typeof user?.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
      (typeof user?.email === 'string' ? user.email.split('@')[0] : '') ||
      'Agent'
    return agentName
  }, [channel, emailSettings?.displaySupportEmail, emailSettings?.outboundFromEmail, user?.email, user?.user_metadata?.full_name])

  const assigneeLabel = useMemo(() => {
    if (!assignedToMemberId) return 'Unassigned'
    if (myMembership?.id === assignedToMemberId) return 'You'
    const m = orgMembers.find((x) => x.id === assignedToMemberId)
    return m?.displayName || m?.email || 'Assignee'
  }, [assignedToMemberId, myMembership?.id, orgMembers])

  const teamInboxLabel = useMemo(() => {
    if (!teamInboxId) return 'Unassigned'
    const ib = orgInboxes.find((x) => x.id === teamInboxId)
    return ib?.name || 'Team inbox'
  }, [orgInboxes, teamInboxId])

  const canSend = useMemo(() => {
    if (sending) return false
    if (!uniqEmails(to).length) return false
    if (!String(subject).trim()) return false
    if (!String(body).trim()) return false
    return true
  }, [to, subject, body, sending])

  const handleSend = useCallback(async () => {
    if (!organizationId) return
    setSending(true)
    setError('')
    try {
      const res = await apiFetch(`/api/org/${encodeURIComponent(organizationId)}/conversations/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          to: uniqEmails(to),
          cc: uniqEmails(cc),
          bcc: uniqEmails(bcc),
          subject: String(subject || '').trim(),
          body: String(body || ''),
          assignedToMemberId,
          teamInboxId,
        }),
      })
      const conversationId = res?.conversation?.id
      if (!conversationId) throw new Error('Server did not return conversation id.')
      navigate(
        `/org/${organizationId}/inbox?conversation=${encodeURIComponent(conversationId)}&isNewConverstion=true`,
      )
    } catch (e) {
      setError(e?.message || 'Failed to send.')
    } finally {
      setSending(false)
    }
  }, [organizationId, channel, to, cc, bcc, subject, body, assignedToMemberId, teamInboxId, navigate])

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0f1422] text-slate-100">
    <div
      className="grid h-full min-h-0 flex-1 gap-0 overflow-hidden"
      style={{ gridTemplateColumns: '260px minmax(0, 2fr) minmax(0, 1fr)' }}
    >
      <InboxSidebar
          activeFilter="inbox"
          filterCounts={{}}
          onSelectPrimaryFilter={() => navigate(`/org/${organizationId}/inbox`)}
          onSelectTeamInbox={(id) => navigate(`/org/${organizationId}/inbox?filter=team_inbox&inbox=${encodeURIComponent(id)}`)}
          onSelectTeammate={(id) => navigate(`/org/${organizationId}/inbox?filter=teammate&memberId=${encodeURIComponent(id)}`)}
          onSelectChannel={(id) => navigate(`/org/${organizationId}/inbox?filter=channel&channelId=${encodeURIComponent(id)}`)}
          mentionCue={false}
          teamInboxes={orgInboxes}
          teammates={orgMembers}
          channels={orgChannels}
          activeInboxId=""
          activeMemberId=""
          activeChannelId=""
        />

        <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-[#27314a] bg-[#181f32]">
          <div className="flex shrink-0 items-center justify-between border-b border-[#27314a] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">New Conversation</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden" />

          <div className="mx-4 mb-4 mt-auto shrink-0 rounded-xl border border-[#2b3652] bg-[#1a2338] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div ref={channelMenuRef} className="relative">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1 text-xs font-medium text-slate-200 hover:bg-[#131e35]"
                  onClick={() => setChannelMenuOpen((v) => !v)}
                  aria-expanded={channelMenuOpen}
                  aria-haspopup="listbox"
                >
                  {channel === 'email' ? <Mail size={14} aria-hidden /> : <MessageSquare size={14} aria-hidden />}
                  <span>{channel === 'email' ? 'Email' : 'Chat'}</span>
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className={`opacity-70 transition-transform ${channelMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {channelMenuOpen ? (
                  <div className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-[#334060] bg-[#0f1728] shadow-lg">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-[#1a2440]"
                      onClick={() => {
                        setChannel('email')
                        setChannelMenuOpen(false)
                      }}
                    >
                      <Mail size={14} aria-hidden />
                      Email
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-[#1a2440]"
                      onClick={() => {
                        setChannel('chat')
                        setChannelMenuOpen(false)
                      }}
                    >
                      <MessageSquare size={14} aria-hidden />
                      Chat
                    </button>
                  </div>
                ) : null}
              </div>
              <span className="text-xs text-slate-500">Use Ctrl/Cmd + Enter to send</span>
            </div>

            <div className="border-b border-[#2b3652] pb-2">
              <div className="flex items-start gap-3 py-2">
                <div className="w-14 shrink-0 pt-1 text-xs text-slate-400">From</div>
                <div className="flex-1">
                  <div className="text-sm text-slate-100">{fromLabel}</div>
                </div>
              </div>

              <EmailPillsInput
                label="To"
                value={to}
                onChange={setTo}
                suggestions={customers}
                placeholder="Type an email…"
                autoFocus
                rightAddon={
                  <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
                    <button
                      type="button"
                      className="hover:text-slate-200"
                      onClick={() => setCcOpen((v) => !v)}
                    >
                      Cc
                    </button>
                    <button
                      type="button"
                      className="hover:text-slate-200"
                      onClick={() => setBccOpen((v) => !v)}
                    >
                      Bcc
                    </button>
                  </div>
                }
              />

              {ccOpen ? (
                <EmailPillsInput
                  label="Cc"
                  value={cc}
                  onChange={setCc}
                  suggestions={customers}
                  placeholder="Add Cc…"
                />
              ) : null}

              {bccOpen ? (
                <EmailPillsInput
                  label="Bcc"
                  value={bcc}
                  onChange={setBcc}
                  suggestions={customers}
                  placeholder="Add Bcc…"
                />
              ) : null}

              <div className="flex items-start gap-3 py-2">
                <div className="w-14 shrink-0 pt-1 text-xs text-slate-400">Subject</div>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-transparent py-1 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  placeholder="Subject"
                />
              </div>
            </div>

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault()
                  if (canSend) handleSend()
                }
              }}
              rows={4}
              placeholder="Type your message…"
              className="mt-3 w-full resize-none rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#4f6290] placeholder:text-slate-500"
            />

            {error ? (
              <p className="mt-2 rounded-md border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">
                {error}
              </p>
            ) : null}

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-xs text-slate-200 hover:bg-[#1a2440]"
                onClick={() => navigate(`/org/${organizationId}/inbox`)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSend}
                onClick={handleSend}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send'}
                <ChevronDown size={14} aria-hidden className="opacity-80" />
              </button>
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#141b2d] text-sm">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#27314a] p-4">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setSidebarTab('details')}
                className={`text-lg ${sidebarTab === 'details' ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('copilot')}
                className={`text-lg ${sidebarTab === 'copilot' ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Copilot
              </button>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <button type="button" className="rounded-md bg-[#1a2338] p-1.5 hover:text-slate-200" aria-label="Action">
                <ChevronDown size={14} aria-hidden />
              </button>
            </div>
          </div>
          <div className="inbox-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 text-slate-300 [scrollbar-gutter:stable]">
            {sidebarTab === 'copilot' ? (
              <div className="rounded-lg border border-[#2a3654] bg-[#101729] p-3 text-xs text-slate-400">
                Copilot is not available on New Conversation yet.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-[#2b3346]" />
                    <div className="h-7 w-7 rounded-full bg-[#2b3346]" />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="shrink-0">Assignee</span>
                    <span className="max-w-[160px] truncate text-right text-white" title={assigneeLabel}>
                      {assigneeLabel}
                    </span>
                  </div>
                  <div ref={assigneeMenuRef} className="relative">
                    <button
                      type="button"
                      aria-expanded={assigneeMenuOpen}
                      aria-haspopup="listbox"
                      onClick={() => setAssigneeMenuOpen((v) => !v)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#334060] bg-[#18233b] px-3 py-2 text-xs font-medium text-white hover:bg-[#1f2d4d]"
                    >
                      Assign
                      <ChevronDown
                        size={14}
                        aria-hidden
                        className={`shrink-0 transition-transform ${assigneeMenuOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {assigneeMenuOpen ? (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-[#2a3654] bg-[#10182a] py-1 shadow-lg [scrollbar-gutter:stable]">
                        <button
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 border-b border-[#2a3654] px-3 py-2 text-left text-xs hover:bg-[#1a2540]"
                          onClick={() => {
                            setAssignedToMemberId(null)
                            setAssigneeMenuOpen(false)
                          }}
                        >
                          <span className="font-medium text-amber-100/90">Unassign</span>
                          <span className="text-[11px] text-slate-500">Clear assignee</span>
                        </button>
                        {orgMembers.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-[#1a2540]"
                            onClick={() => {
                              setAssignedToMemberId(m.id)
                              setAssigneeMenuOpen(false)
                            }}
                          >
                            <span className="font-medium text-white">
                              {m.displayName || m.email || 'Teammate'}
                              {m.userId === user?.id ? <span className="ml-1 text-slate-400">(you)</span> : null}
                            </span>
                            {m.email ? <span className="text-[11px] text-slate-500">{m.email}</span> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-[#27314a] pt-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="shrink-0">Team inbox</span>
                    <span className="max-w-[160px] truncate text-right text-white" title={teamInboxLabel}>
                      {teamInboxLabel}
                    </span>
                  </div>
                  <div ref={teamInboxMenuRef} className="relative">
                    <button
                      type="button"
                      aria-expanded={teamInboxMenuOpen}
                      aria-haspopup="listbox"
                      onClick={() => setTeamInboxMenuOpen((v) => !v)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#334060] bg-[#18233b] px-3 py-2 text-xs font-medium text-white hover:bg-[#1f2d4d]"
                    >
                      Assign team inbox
                      <ChevronDown
                        size={14}
                        aria-hidden
                        className={`shrink-0 transition-transform ${teamInboxMenuOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {teamInboxMenuOpen ? (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-[#2a3654] bg-[#10182a] py-1 shadow-lg [scrollbar-gutter:stable]">
                        <button
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 border-b border-[#2a3654] px-3 py-2 text-left text-xs hover:bg-[#1a2540]"
                          onClick={() => {
                            setTeamInboxId(null)
                            setTeamInboxMenuOpen(false)
                          }}
                        >
                          <span className="font-medium text-amber-100/90">Unassign</span>
                          <span className="text-[11px] text-slate-500">Remove from team queue</span>
                        </button>
                        {orgInboxes.map((ib) => (
                          <button
                            key={ib.id}
                            type="button"
                            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-[#1a2540]"
                            onClick={() => {
                              setTeamInboxId(ib.id)
                              setTeamInboxMenuOpen(false)
                            }}
                          >
                            <span className="font-medium text-white">{ib.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-[#27314a] pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Conversation attributes
                  </span>
                  <div className="rounded-md border border-[#2a3654] bg-[#101729] px-3 py-2 text-xs text-slate-300">
                    {channel === 'chat'
                      ? 'Chat is delivered via email fallback (realtime web delivery pending).'
                      : 'Email is delivered via workspace email channel.'}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}

