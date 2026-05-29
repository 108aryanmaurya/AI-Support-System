import {
  BookOpen,
  ChevronDown,
  Download,
  HelpCircle,
  Search,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuthContext } from '../context/AuthContext.jsx'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { useOrgPermissionsContext } from '../context/OrgPermissionsContext.jsx'
import { RestrictedControl } from '../components/RestrictedControl.jsx'
import { fetchOrgMembers, fetchOrgPendingInvites } from '../services/orgWorkspaceApi.js'

const teammateTabs = [
  { id: 'teammates', label: 'Teammates' },
  { id: 'invited', label: 'Invited' },
  { id: 'roles', label: 'Roles' },
  { id: 'scim', label: 'SCIM Provisioning' },
  { id: 'activity', label: 'Activity logs' },
]

const filterPills = [
  'Status is Any',
  'Seat is Any',
  'Team inbox is Any',
  'Copilot access is Any',
  'Alias is Any',
]

function displayNameFromMember(m) {
  const fn = typeof m.firstName === 'string' ? m.firstName.trim() : ''
  const ln = typeof m.lastName === 'string' ? m.lastName.trim() : ''
  const combined = `${fn} ${ln}`.trim()
  if (combined) return combined
  const email = typeof m.email === 'string' ? m.email : ''
  if (email.includes('@')) return email.split('@')[0].replace(/[._]/g, ' ')
  return 'Teammate'
}

function initialsFromName(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'
}

function permissionLabel(role) {
  const r = String(role ?? '').toUpperCase()
  if (r === 'ADMIN') return 'Complete Access'
  if (r === 'AGENT') return 'Agent'
  return r || '—'
}

export default function OrgTeammatesPage() {
  const { orgId } = useParams()
  const location = useLocation()
  const { user } = useAuthContext()
  const { organizations } = useOrganizationContext()
  const current = organizations.find((o) => o.orgId === orgId)
  const { can, deny } = useOrgPermissionsContext()
  const canInvite = can('team.invite')
  const inviteDenyReason = deny('team.invite')

  const [bannerOpen, setBannerOpen] = useState(true)
  const [inviteNotice, setInviteNotice] = useState(
    () => location.state?.inviteNotice ?? '',
  )
  const [activeTab, setActiveTab] = useState('teammates')
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [loadingInvites, setLoadingInvites] = useState(false)
  const [listError, setListError] = useState('')

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true)
    setListError('')
    try {
      const data = await fetchOrgMembers(orgId)
      setMembers(Array.isArray(data?.members) ? data.members : [])
    } catch (e) {
      setListError(e?.message || 'Could not load teammates.')
      setMembers([])
    } finally {
      setLoadingMembers(false)
    }
  }, [orgId])

  const loadInvites = useCallback(async () => {
    setLoadingInvites(true)
    setListError('')
    try {
      const data = await fetchOrgPendingInvites(orgId)
      setInvites(Array.isArray(data?.invites) ? data.invites : [])
    } catch (e) {
      setListError(e?.message || 'Could not load invites.')
      setInvites([])
    } finally {
      setLoadingInvites(false)
    }
  }, [orgId])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  useEffect(() => {
    if (activeTab === 'invited') void loadInvites()
  }, [activeTab, loadInvites])

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => {
      const name = displayNameFromMember(m).toLowerCase()
      const email = (m.email ?? '').toLowerCase()
      return name.includes(q) || email.includes(q)
    })
  }, [members, search])

  function exportCsv() {
    const headers = ['Name', 'Email', 'Role', 'Status']
    const rows = members.map((m) => [
      displayNameFromMember(m),
      m.email ?? '',
      m.role ?? '',
      m.status ?? '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `teammates-${orgId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const invitePath = `/org/${orgId}/settings/teammates/invite/new`

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-[#0b1020] px-4 py-6 text-slate-100 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        {inviteNotice ? (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p>{inviteNotice}</p>
            <button
              type="button"
              onClick={() => setInviteNotice('')}
              className="shrink-0 text-amber-200/80 transition hover:text-amber-50"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[#2b3858] bg-[#151b2e] text-slate-300">
              <Users className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-xl font-semibold text-white">Teammates</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-[#2b3858] bg-[#151b2e] px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-[#3ECF8E]/35"
            >
              <BookOpen className="h-4 w-4 text-slate-400" />
              Learn
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </button>
            <RestrictedControl restricted={!canInvite} reason={inviteDenyReason}>
              {canInvite ? (
                <Link
                  to={invitePath}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  + New teammate
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-lg bg-white/60 px-4 py-2 text-sm font-semibold text-slate-600"
                >
                  + New teammate
                </button>
              )}
            </RestrictedControl>
          </div>
        </header>

        {bannerOpen ? (
          <div className="relative mb-6 overflow-hidden rounded-xl border border-[#2b3858] bg-[#141821]">
            <button
              type="button"
              onClick={() => setBannerOpen(false)}
              className="absolute right-3 top-3 rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-col gap-6 p-5 md:flex-row md:items-center md:justify-between md:pr-12">
              <div className="max-w-xl space-y-2">
                <p className="text-base font-semibold text-white">Invite your teammates to ResolveAI</p>
                <p className="text-sm leading-relaxed text-slate-400">
                  You can add them one by one or upload many with a CSV file. You&apos;ll also be able to set up
                  their permissions and roles.
                </p>
                <RestrictedControl restricted={!canInvite} reason={inviteDenyReason} className="mt-2 inline-flex">
                  {canInvite ? (
                    <Link
                      to={invitePath}
                      className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                    >
                      + Add new teammates
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center rounded-lg bg-white/60 px-4 py-2 text-sm font-semibold text-slate-600"
                    >
                      + Add new teammates
                    </button>
                  )}
                </RestrictedControl>
              </div>
              <div className="hidden shrink-0 md:block">
                <div className="flex h-28 w-52 flex-col justify-between rounded-lg bg-gradient-to-br from-violet-600 to-violet-900 p-3 shadow-lg">
                  <div className="flex items-center gap-1">
                    <span className="h-7 w-7 rounded-full bg-white/25" />
                    <span className="h-7 w-7 rounded-full bg-white/20" />
                    <span className="h-7 w-7 rounded-full bg-white/15" />
                  </div>
                  <div className="rounded-md bg-white/15 px-2 py-2 text-[10px] text-white/95">
                    <p className="font-semibold">Hello, there!</p>
                    <p className="text-white/80">How can we help?</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-[#2b3858] pb-px">
          {teammateTabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? '-mb-px border-orange-500 text-orange-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {listError ? <p className="mb-4 text-sm text-rose-400">{listError}</p> : null}

        {activeTab === 'teammates' ? (
          <>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative max-w-md flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search teammates"
                  className="w-full rounded-lg border border-[#2b3858] bg-[#111827] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-[#3ECF8E]/40 focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/30"
                  aria-label="Search teammates"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {filterPills.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#2b3858] bg-[#151b2e] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600"
                  >
                    {label}
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-400">
                <span className="font-medium text-slate-200">{filteredMembers.length}</span>{' '}
                {filteredMembers.length === 1 ? 'teammate' : 'teammates'}
              </p>
              <button
                type="button"
                onClick={exportCsv}
                disabled={members.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-[#2b3858] px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:border-[#3ECF8E]/35 disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#2b3858] bg-[#0e1420]">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#2b3858] text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Seat</th>
                    <th className="px-4 py-3 font-medium">Copilot access</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        Permission
                        <HelpCircle className="h-3.5 w-3.5 text-slate-600" aria-hidden />
                      </span>
                    </th>
                    <th className="px-4 py-3 font-medium">Teams</th>
                    <th className="px-4 py-3 font-medium">2fa</th>
                    <th className="px-4 py-3 font-medium">Alias</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMembers ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        Loading teammates…
                      </td>
                    </tr>
                  ) : filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        No teammates match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((m) => {
                      const name = displayNameFromMember(m)
                      const isSelf = user?.id && m.userId === user.id
                      return (
                        <tr key={m.membershipId ?? m.userId} className="border-b border-[#2b3858]/80 text-slate-300">
                          <td className="px-4 py-4 align-top">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2b3858] text-xs font-semibold text-slate-200">
                                {initialsFromName(name)}
                              </span>
                              <div>
                                <p className="font-medium text-white">
                                  {name}
                                  {isSelf ? (
                                    <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>
                                  ) : null}
                                </p>
                                <p className="text-xs text-slate-500">{m.email ?? '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                              Active
                              <ChevronDown className="h-3 w-3" />
                            </span>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <span className="rounded-md bg-[#2b3858] px-2 py-1 text-xs font-medium text-slate-300">
                              FULL
                            </span>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md border border-[#2b3858] bg-[#151b2e] px-2 py-1 text-xs text-slate-200"
                            >
                              Unlimited
                              <ChevronDown className="h-3 w-3 text-slate-500" />
                            </button>
                          </td>
                          <td className="px-4 py-4 align-middle text-slate-300">{permissionLabel(m.role)}</td>
                          <td className="px-4 py-4 align-middle text-slate-500">—</td>
                          <td className="px-4 py-4 align-middle text-slate-400">Disabled</td>
                          <td className="px-4 py-4 align-middle text-slate-500">—</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-6 text-center text-sm text-slate-600">
              <Link to={`/org/${orgId}/settings`} className="text-[#3ECF8E] hover:underline">
                ← Back to settings home
              </Link>
            </p>
          </>
        ) : null}

        {activeTab === 'invited' ? (
          <div className="space-y-4">
            {loadingInvites ? (
              <p className="text-sm text-slate-500">Loading invites…</p>
            ) : invites.length === 0 ? (
              <p className="rounded-xl border border-[#2b3858] bg-[#111827]/50 px-6 py-12 text-center text-sm text-slate-500">
                No pending invitations.
                {canInvite ? (
                  <>
                    {' '}
                    <Link to={invitePath} className="text-[#3ECF8E] hover:underline">
                      Invite teammates
                    </Link>
                  </>
                ) : null}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#2b3858] bg-[#0e1420]">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#2b3858] text-xs uppercase text-slate-500">
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Sent</th>
                      <th className="px-4 py-3">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((inv) => (
                      <tr key={inv.id} className="border-b border-[#2b3858]/80">
                        <td className="px-4 py-3 text-slate-200">{inv.email}</td>
                        <td className="px-4 py-3 text-slate-400">{inv.role}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {activeTab !== 'teammates' && activeTab !== 'invited' ? (
          <div className="rounded-xl border border-[#2b3858] bg-[#111827]/50 px-6 py-16 text-center text-sm text-slate-500">
            This section is not wired yet. Switch to the <strong className="text-slate-400">Teammates</strong> or{' '}
            <strong className="text-slate-400">Invited</strong> tab.
          </div>
        ) : null}
      </div>
    </main>
  )
}
