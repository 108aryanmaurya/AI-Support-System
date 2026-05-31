import { ChevronDown, ChevronRight, Inbox, LayoutGrid } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useOrgPermissionsContext } from '../context/OrgPermissionsContext.jsx'
import { fetchOrgInboxes } from '../services/inboxesApi.js'
import { parseInviteEmails } from '../utils/parseInviteEmails.js'
import {
  describeInviteInboxTargets,
  normalizeInviteDraftInboxIds,
  saveInviteDraft,
} from '../utils/inviteDraftStorage.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function OrgInviteTeammatesPage() {
  const { orgId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { can } = useOrgPermissionsContext()
  const canInvite = can('team.invite')

  const [rawEmails, setRawEmails] = useState('')
  const [inboxes, setInboxes] = useState([])
  const [selectedInboxIds, setSelectedInboxIds] = useState([])
  const [loadingInboxes, setLoadingInboxes] = useState(true)
  const [error, setError] = useState('')

  const inboxFromUrl = searchParams.get('inbox')?.trim() ?? ''

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingInboxes(true)
      try {
        const data = await fetchOrgInboxes(orgId)
        const list = (data?.inboxes ?? []).filter((ib) => ib.status === 'active')
        if (cancelled) return
        setInboxes(list)
        if (inboxFromUrl && list.some((ib) => ib.id === inboxFromUrl)) {
          setSelectedInboxIds([inboxFromUrl])
        }
      } catch {
        if (!cancelled) setInboxes([])
      } finally {
        if (!cancelled) setLoadingInboxes(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [orgId, inboxFromUrl])

  useEffect(() => {
    if (loadingInboxes) return
    setSelectedInboxIds((prev) => {
      const active = new Set(inboxes.map((ib) => ib.id))
      const next = prev.filter((id) => active.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [loadingInboxes, inboxes])

  const parsedEmails = useMemo(() => parseInviteEmails(rawEmails), [rawEmails])
  const validEmails = useMemo(
    () => parsedEmails.filter((e) => EMAIL_RE.test(e)),
    [parsedEmails],
  )
  const activeInboxIdSet = useMemo(() => new Set(inboxes.map((ib) => ib.id)), [inboxes])
  const validatedSelectedInboxIds = useMemo(
    () => selectedInboxIds.filter((id) => activeInboxIdSet.has(id)),
    [selectedInboxIds, activeInboxIdSet],
  )
  const mustSelectInbox = inboxes.length > 0
  const canContinue =
    validEmails.length > 0 &&
    !loadingInboxes &&
    (!mustSelectInbox || validatedSelectedInboxIds.length > 0)

  useEffect(() => {
    const draft = location.state
    if (!draft) return
    if (Array.isArray(draft.emails) && draft.emails.length > 0) {
      setRawEmails(draft.emails.join('\n'))
    }
    const restored = normalizeInviteDraftInboxIds(draft.inboxIds ?? draft.inboxId)
    if (restored.length > 0) setSelectedInboxIds(restored)
  }, [location.state])

  const inboxSummary = useMemo(
    () => describeInviteInboxTargets(validatedSelectedInboxIds, inboxes),
    [validatedSelectedInboxIds, inboxes],
  )

  function handleContinue() {
    if (!canContinue) {
      if (validEmails.length === 0) {
        setError('Enter at least one valid email address.')
      } else if (loadingInboxes) {
        setError('Wait for team inboxes to finish loading.')
      } else if (mustSelectInbox) {
        setError('Select at least one team inbox.')
      }
      return
    }
    setError('')
    const draft = { emails: validEmails, inboxIds: validatedSelectedInboxIds }
    saveInviteDraft(orgId, draft)
    navigate(`/org/${orgId}/settings/teammates/invite/new/permissions`, { state: draft })
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
              title={
                !canContinue && validEmails.length > 0 && mustSelectInbox
                  ? 'Select at least one team inbox'
                  : undefined
              }
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
            >
              Continue and set permissions
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
            <h2 className="text-lg font-semibold text-white">Configure their inboxes</h2>
            <p className="mt-2 text-sm text-slate-500">
              {mustSelectInbox
                ? 'Select one or more team inboxes. Invitees are only added to the inboxes you choose when they accept.'
                : 'No team inboxes in this workspace yet. Invitees will join the organization only; you can add them to inboxes later.'}
            </p>

            <div className="mt-6">
              {loadingInboxes ? (
                <p className="text-sm text-slate-600">Loading team inboxes…</p>
              ) : mustSelectInbox ? (
                <>
                  <InboxMultiSelect
                    inboxes={inboxes}
                    selectedInboxIds={selectedInboxIds}
                    requireSelection
                    onChange={setSelectedInboxIds}
                  />
                  <p className="mt-3 text-xs text-slate-500">
                    On accept, invitees will join{' '}
                    <span className="font-medium text-slate-400">{inboxSummary}</span>.
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-600">
                  Optional:{' '}
                  <Link
                    to={`/org/${orgId}/settings/inboxes`}
                    className="text-[#6eb5ff] hover:underline"
                  >
                    create team inboxes
                  </Link>{' '}
                  to assign queue access when they accept.
                </p>
              )}
            </div>
          </div>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        </section>
      </div>
    </main>
  )
}

function InboxMultiSelect({ inboxes, selectedInboxIds, onChange, requireSelection = false }) {
  const [open, setOpen] = useState(false)
  const selectedSet = useMemo(() => new Set(selectedInboxIds), [selectedInboxIds])

  const label =
    selectedInboxIds.length === 0
      ? 'Select team inboxes…'
      : selectedInboxIds.length === 1
        ? inboxes.find((ib) => ib.id === selectedInboxIds[0])?.name ?? '1 inbox'
        : `${selectedInboxIds.length} inboxes selected`

  function toggleInbox(id) {
    const next = selectedSet.has(id)
      ? selectedInboxIds.filter((x) => x !== id)
      : [...selectedInboxIds, id]
    if (requireSelection && next.length === 0) return
    onChange(next)
  }

  return (
    <div className="relative max-w-md">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#2b3858] bg-[#111827] px-4 py-3 text-left text-sm text-slate-200 transition hover:border-[#3ECF8E]/35"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Inbox className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <span
            className={
              selectedInboxIds.length > 0 ? 'truncate font-medium text-white' : 'text-slate-400'
            }
          >
            {label}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <ul
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[#2b3858] bg-[#151b2e] py-1 shadow-xl"
          role="listbox"
          aria-multiselectable="true"
        >
          {inboxes.map((ib) => {
            const checked = selectedSet.has(ib.id)
            return (
              <li key={ib.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggleInbox(ib.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-[#1a2238]"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-[#3ECF8E] bg-[#3ECF8E]/30' : 'border-slate-600'
                    }`}
                  >
                    {checked ? (
                      <span className="text-[10px] font-bold text-[#3ECF8E]">✓</span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 font-medium">{ib.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
