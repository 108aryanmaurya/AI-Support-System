import { ChevronDown, ChevronRight, LayoutGrid } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { useOrgPermissionsContext } from '../context/OrgPermissionsContext.jsx'
import { fetchOrgChannels, postOrgInvitesBatch } from '../services/orgWorkspaceApi.js'
import { parseInviteEmails } from '../utils/parseInviteEmails.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function OrgInviteTeammatesPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { organizations } = useOrganizationContext()

  const current = organizations.find((o) => o.orgId === orgId)
  const { can } = useOrgPermissionsContext()
  const canInvite = can('team.invite')

  const [rawEmails, setRawEmails] = useState('')
  const [channels, setChannels] = useState([])
  const [primaryIds, setPrimaryIds] = useState([])
  const [secondaryIds, setSecondaryIds] = useState([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingChannels(true)
      try {
        const data = await fetchOrgChannels(orgId)
        if (!cancelled) setChannels(Array.isArray(data?.channels) ? data.channels : [])
      } catch {
        if (!cancelled) setChannels([])
      } finally {
        if (!cancelled) setLoadingChannels(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [orgId])

  const parsedEmails = useMemo(() => parseInviteEmails(rawEmails), [rawEmails])
  const validEmails = useMemo(
    () => parsedEmails.filter((e) => EMAIL_RE.test(e)),
    [parsedEmails],
  )
  const canContinue = validEmails.length > 0 && !submitting

  async function handleContinue() {
    if (!canContinue) return
    setError('')
    setSubmitting(true)
    try {
      const data = await postOrgInvitesBatch(orgId, { emails: validEmails, role: 'AGENT' })
      const created = Array.isArray(data?.created) ? data.created : []
      const errs = Array.isArray(data?.errors) ? data.errors : []
      if (errs.length > 0 && created.length === 0) {
        setError(errs.map((x) => `${x.email}: ${x.error}`).join('\n'))
        return
      }
      navigate(`/org/${orgId}/settings/teammates`, { replace: true })
    } catch (e) {
      setError(e?.message || 'Could not send invites.')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleChannel(id, which) {
    if (which === 'primary') {
      setPrimaryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    } else {
      setSecondaryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    }
  }

  if (!canInvite) {
    return <Navigate to={`/org/${orgId}/settings/teammates`} replace />
  }

  const base = `/org/${orgId}/settings/teammates`

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-[#0b1020] px-4 py-6 text-slate-100 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
              <LayoutGrid className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
              <Link to={base} className="hover:text-[#3ECF8E]">
                All teammates
              </Link>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
              <span className="font-medium text-slate-300">Invite teammates</span>
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(base)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canContinue}
              onClick={handleContinue}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
            >
              {submitting ? 'Sending…' : 'Continue and set permissions'}
            </button>
          </div>
        </header>

        <section className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold text-white">Invite new teammates</h2>
            <p className="mt-2 text-sm text-slate-500">
              You can invite multiple teammates by separating them with a comma, space or newline.
            </p>
            <textarea
              value={rawEmails}
              onChange={(e) => setRawEmails(e.target.value)}
              placeholder="Enter your teammates' email addresses"
              rows={8}
              className="mt-4 w-full resize-y rounded-xl border border-[#2b3858] bg-[#111827] px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-[#3ECF8E]/40 focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/30"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Configure their inboxes</h2>
              <span className="rounded-full border border-[#2b3858] bg-[#151b2e] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Optional
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Choose which inboxes your teammates should be added to.
            </p>

            <div className="mt-6 space-y-6">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Primary
                </p>
                {loadingChannels ? (
                  <p className="text-sm text-slate-600">Loading channels…</p>
                ) : channels.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No channels yet. Connect a channel in workspace settings to assign inboxes here.
                  </p>
                ) : (
                  <ChannelMultiSelect
                    channels={channels}
                    selectedIds={primaryIds}
                    onToggle={(id) => toggleChannel(id, 'primary')}
                  />
                )}
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Secondary
                </p>
                {loadingChannels ? (
                  <p className="text-sm text-slate-600">Loading channels…</p>
                ) : channels.length === 0 ? (
                  <p className="text-sm text-slate-600">—</p>
                ) : (
                  <ChannelMultiSelect
                    channels={channels}
                    selectedIds={secondaryIds}
                    onToggle={(id) => toggleChannel(id, 'secondary')}
                  />
                )}
              </div>
            </div>
          </div>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          <p className="text-xs text-slate-600">
            Inbox assignment is stored for future use when routing rules support per-invite channel membership.
          </p>
        </section>
      </div>
    </main>
  )
}

function ChannelMultiSelect({ channels, selectedIds, onToggle }) {
  const [open, setOpen] = useState(false)
  const label =
    selectedIds.length === 0
      ? 'Select inboxes'
      : `${selectedIds.length} inbox${selectedIds.length === 1 ? '' : 'es'} selected`

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full max-w-md items-center justify-between rounded-xl border border-[#2b3858] bg-[#111827] px-4 py-3 text-left text-sm text-slate-200 transition hover:border-[#3ECF8E]/35"
      >
        <span className={selectedIds.length ? 'text-white' : 'text-slate-500'}>{label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <ul
          className="absolute z-20 mt-1 max-h-56 w-full max-w-md overflow-auto rounded-xl border border-[#2b3858] bg-[#151b2e] py-1 shadow-xl"
          role="listbox"
        >
          {channels.map((ch) => {
            const checked = selectedIds.includes(ch.id)
            return (
              <li key={ch.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => onToggle(ch.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-[#1a2238]"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 rounded border ${
                      checked ? 'border-[#3ECF8E] bg-[#3ECF8E]/20' : 'border-slate-600'
                    }`}
                  />
                  <span className="font-medium">{ch.name}</span>
                  <span className="text-xs text-slate-500">{ch.type}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
