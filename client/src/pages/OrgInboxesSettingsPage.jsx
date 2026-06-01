import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Hand,
  Inbox,
  Loader2,
  Plus,
  RotateCw,
  Scale,
  Search,
  SquareStack,
  Trash2,
  User,
} from 'lucide-react'
import {
  defaultInboxMemberPermissionsForAssignmentMethod,
  INBOX_ASSIGNMENT_METHOD_DEFAULT,
  mergeInboxSettings,
} from '@ai-support/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { useWorkspaceCanManage } from '../hooks/useWorkspaceCanManage.js'
import { apiFetch } from '../services/api.js'
import {
  createOrgInbox,
  fetchOrgInboxes,
  patchOrgInbox,
  replaceInboxMembers,
} from '../services/inboxesApi.js'
import { fetchOrgMembers } from '../services/orgWorkspaceApi.js'

const ASSIGNMENT_METHODS = [
  {
    id: 'manual',
    title: 'Manual',
    description: 'Conversations must be manually assigned to your teammates.',
    icon: Hand,
    iconClass: 'text-orange-400',
  },
  {
    id: 'round_robin',
    title: 'Round robin',
    description: 'Conversations are automatically assigned to teammates in sequential order.',
    icon: RotateCw,
    iconClass: 'text-slate-300',
  },
  {
    id: 'balanced',
    title: 'Balanced',
    description:
      'Conversations are automatically assigned to the teammate with the fewest open conversations.',
    icon: Scale,
    iconClass: 'text-slate-300',
    badge: 'Pro',
  },
]

function memberDisplayName(m) {
  const fn = typeof m.firstName === 'string' ? m.firstName.trim() : ''
  const ln = typeof m.lastName === 'string' ? m.lastName.trim() : ''
  const combined = `${fn} ${ln}`.trim()
  if (combined) return combined
  if (typeof m.displayName === 'string' && m.displayName.trim()) return m.displayName.trim()
  if (typeof m.email === 'string' && m.email) return m.email
  return 'Teammate'
}

function mapOrgMembersForPicker(rows) {
  return (rows ?? []).map((m) => ({
    id: m.id,
    email: m.email ?? null,
    firstName: m.firstName ?? null,
    lastName: m.lastName ?? null,
    displayName: memberDisplayName(m),
  }))
}

function inboxIconColor(name) {
  const palette = ['bg-amber-500/20 text-amber-300', 'bg-sky-500/20 text-sky-300', 'bg-violet-500/20 text-violet-300']
  const i = (name?.charCodeAt(0) ?? 0) % palette.length
  return palette[i]
}

function UpsellBlock({ title, description, linkLabel }) {
  return (
    <div className="rounded-xl border border-[#2b3858] bg-[#0f1422] p-5">
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        {description}{' '}
        <button type="button" className="text-[#6eb5ff] hover:underline">
          {linkLabel}
        </button>
      </p>
      <button
        type="button"
        className="mt-4 rounded-lg bg-violet-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
      >
        Get the feature
      </button>
    </div>
  )
}

function TeamInboxEditor({
  draft,
  members,
  canManage,
  isNew,
  saving,
  onDraftChange,
  onToggleMember,
  onSave,
  onCancel,
  onDelete,
  onInviteTeammates,
  onAssignmentMethodChange,
}) {
  const [teammateQuery, setTeammateQuery] = useState('')
  const assignmentMethod = draft.assignmentMethod ?? INBOX_ASSIGNMENT_METHOD_DEFAULT

  const filteredMembers = useMemo(() => {
    const q = teammateQuery.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => {
      const label = `${m.displayName ?? ''} ${m.email ?? ''}`.toLowerCase()
      return label.includes(q)
    })
  }, [members, teammateQuery])

  const selectedCount = draft.memberIds.length
  const canSave = draft.name.trim().length > 0 && selectedCount > 0

  return (
    <div className="border-t border-orange-500/40 bg-[#12192c] px-4 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${inboxIconColor(draft.name)}`}
          >
            <Inbox className="h-5 w-5" aria-hidden />
          </span>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => onDraftChange({ name: e.target.value })}
            placeholder="Untitled Team Inbox"
            className="min-w-0 flex-1 border-0 bg-transparent text-lg font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:ring-0"
            maxLength={120}
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1a2338] hover:text-white"
          aria-label="Collapse"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-6">
        <label className="text-sm font-medium text-white">
          Teammates <span className="text-rose-400">*</span>
        </label>
        <p className="mt-1 text-xs text-slate-500">
          {isNew
            ? 'Select at least one organization member. The inbox cannot be created without members.'
            : 'Members who can access this inbox.'}
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={teammateQuery}
              onChange={(e) => setTeammateQuery(e.target.value)}
              placeholder="Search teammates…"
              className="w-full rounded-lg border border-[#2b3858] bg-[#0b1020] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500"
            />
          </div>
          <button
            type="button"
            onClick={onInviteTeammates}
            className="shrink-0 rounded-lg border border-[#3a4b6f] bg-[#1a2338] px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 hover:text-white"
          >
            + Invite teammates
          </button>
        </div>

        {members.length === 0 ? (
          <p className="mt-3 rounded-lg border border-[#2b3858] bg-[#0b1020] px-3 py-3 text-sm text-slate-500">
            No teammates in this organization yet.{' '}
            <button type="button" onClick={onInviteTeammates} className="text-[#6eb5ff] hover:underline">
              Invite someone
            </button>{' '}
            before creating an inbox.
          </p>
        ) : (
          <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[#2b3858] bg-[#0b1020] p-2">
            {filteredMembers.length === 0 ? (
              <li className="px-2 py-2 text-sm text-slate-500">No teammates match your search.</li>
            ) : (
              filteredMembers.map((m) => (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-[#151b2e]">
                    <input
                      type="checkbox"
                      checked={draft.memberIds.includes(m.id)}
                      onChange={() => onToggleMember(m.id)}
                      className="rounded border-slate-600"
                    />
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2b3858] text-xs font-medium text-slate-300">
                      {memberDisplayName(m).charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-200">{memberDisplayName(m)}</span>
                      {m.email ? (
                        <span className="block truncate text-xs text-slate-500">{m.email}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
        )}

        {selectedCount > 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            {selectedCount} teammate{selectedCount === 1 ? '' : 's'} selected
          </p>
        ) : (
          <p className="mt-2 text-xs text-amber-400/90">Select at least one teammate to save.</p>
        )}
      </div>

      <div className="mt-8">
        <h4 className="text-sm font-medium text-white">Choose an assignment method</h4>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {ASSIGNMENT_METHODS.map((method) => {
            const Icon = method.icon
            const selected = assignmentMethod === method.id
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => onAssignmentMethodChange(method.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  selected
                    ? 'border-orange-500/60 bg-[#1a2338] ring-1 ring-orange-500/30'
                    : 'border-[#2b3858] bg-[#0f1422] hover:border-[#3a4b6f]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${method.iconClass}`} aria-hidden />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{method.title}</span>
                      {method.badge ? (
                        <span className="rounded bg-violet-600/30 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200">
                          {method.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{method.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {assignmentMethod === 'manual'
            ? 'Teammates assign conversations manually. Inbox members get standard inbox permissions.'
            : assignmentMethod === 'round_robin'
              ? 'Unassigned conversations are auto-assigned using traditional round robin among eligible inbox members (sequential rotation). Sticky customer history is not used.'
              : 'Unassigned conversations are auto-assigned to the inbox member with the fewest open conversations (balanced / least-loaded). Sticky customer history is not used.'}{' '}
          Org AI must be enabled for automatic assignment.
        </p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <UpsellBlock
          title="Set team office hours"
          description="Set office hours for your team inbox to manage customer expectations. "
          linkLabel="More about team office hours."
        />
        <UpsellBlock
          title="Set team reply time"
          description="Set a team-level target reply time for your inbox. "
          linkLabel="More about team reply time."
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[#2b3858] pt-5">
        <div>
          {!isNew ? (
            <button
              type="button"
              onClick={onDelete}
              className="text-sm font-medium text-red-400 hover:text-red-300"
            >
              Delete team inbox
            </button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#3a4b6f] px-4 py-2 text-sm font-medium text-slate-200 hover:bg-[#1a2338]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || saving || !canManage}
            onClick={onSave}
            className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrgInboxesSettingsPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { organizations } = useOrganizationContext()
  const current = organizations.find((o) => o.orgId === orgId)
  const canManage = useWorkspaceCanManage(orgId)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inboxes, setInboxes] = useState([])
  const [members, setMembers] = useState([])
  const [memberCounts, setMemberCounts] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({
    name: '',
    memberIds: [],
    inboxId: null,
    assignmentMethod: INBOX_ASSIGNMENT_METHOD_DEFAULT,
  })

  const loadMemberCounts = useCallback(
    async (inboxList) => {
      if (!orgId || !inboxList?.length) {
        setMemberCounts({})
        return
      }
      const entries = await Promise.all(
        inboxList.map(async (ib) => {
          try {
            const res = await apiFetch(
              `/api/org/${encodeURIComponent(orgId)}/inboxes/${encodeURIComponent(ib.id)}/members`,
            )
            return [ib.id, (res?.members ?? []).length]
          } catch {
            return [ib.id, 0]
          }
        }),
      )
      setMemberCounts(Object.fromEntries(entries))
    },
    [orgId],
  )

  const load = useCallback(async () => {
    if (!orgId) return
    setError('')
    setLoading(true)
    try {
      const [inboxRes, memberRes] = await Promise.all([
        fetchOrgInboxes(orgId),
        fetchOrgMembers(orgId),
      ])
      const list = (inboxRes?.inboxes ?? []).filter((ib) => ib.status === 'active')
      setInboxes(list)
      setMembers(mapOrgMembersForPicker(memberRes?.members))
      await loadMemberCounts(list)
    } catch (e) {
      setError(e.message || 'Failed to load inboxes.')
    } finally {
      setLoading(false)
    }
  }, [orgId, loadMemberCounts])

  useEffect(() => {
    load()
  }, [load])

  const openNewInboxForm = () => {
    setIsCreatingNew(true)
    setExpandedId(null)
    setDraft({
      name: 'Untitled Team Inbox',
      memberIds: [],
      inboxId: null,
      assignmentMethod: INBOX_ASSIGNMENT_METHOD_DEFAULT,
    })
  }

  const openEditInbox = async (inbox) => {
    setIsCreatingNew(false)
    setExpandedId(inbox.id)
    setError('')
    try {
      const res = await apiFetch(
        `/api/org/${encodeURIComponent(orgId)}/inboxes/${encodeURIComponent(inbox.id)}/members`,
      )
      const ids = (res?.members ?? []).map((m) => m.organizationMemberId)
      const settings = mergeInboxSettings(inbox.settings)
      setDraft({
        name: inbox.name,
        memberIds: ids,
        inboxId: inbox.id,
        assignmentMethod: settings.assignmentMethod,
      })
    } catch {
      const settings = mergeInboxSettings(inbox.settings)
      setDraft({
        name: inbox.name,
        memberIds: [],
        inboxId: inbox.id,
        assignmentMethod: settings.assignmentMethod,
      })
    }
  }

  const closeForm = () => {
    setIsCreatingNew(false)
    setExpandedId(null)
    setDraft({
      name: '',
      memberIds: [],
      inboxId: null,
      assignmentMethod: INBOX_ASSIGNMENT_METHOD_DEFAULT,
    })
  }

  const toggleDraftMember = (memberId) => {
    setDraft((prev) => ({
      ...prev,
      memberIds: prev.memberIds.includes(memberId)
        ? prev.memberIds.filter((id) => id !== memberId)
        : [...prev.memberIds, memberId],
    }))
  }

  const handleSave = async () => {
    if (!canManage || !orgId) return
    const name = draft.name.trim()
    if (!name) {
      setError('Inbox name is required.')
      return
    }
    if (draft.memberIds.length === 0) {
      setError('Select at least one teammate.')
      return
    }
    const assignmentMethod = draft.assignmentMethod ?? INBOX_ASSIGNMENT_METHOD_DEFAULT
    const memberPermissions = Object.fromEntries(
      draft.memberIds.map((id) => [
        id,
        defaultInboxMemberPermissionsForAssignmentMethod(assignmentMethod),
      ]),
    )

    setSaving(true)
    setError('')
    try {
      if (isCreatingNew || !draft.inboxId) {
        const res = await createOrgInbox(orgId, {
          name,
          memberIds: draft.memberIds,
          settings: { assignmentMethod },
        })
        if (res?.inbox) {
          setInboxes((prev) => [...prev, res.inbox].sort((a, b) => a.name.localeCompare(b.name)))
          setMemberCounts((prev) => ({ ...prev, [res.inbox.id]: draft.memberIds.length }))
        } else {
          await load()
        }
      } else {
        await patchOrgInbox(orgId, draft.inboxId, {
          name,
          settings: { assignmentMethod },
        })
        await replaceInboxMembers(
          orgId,
          draft.inboxId,
          draft.memberIds,
          {},
          memberPermissions,
        )
        setInboxes((prev) =>
          prev
            .map((ib) =>
              ib.id === draft.inboxId
                ? {
                    ...ib,
                    name,
                    settings: mergeInboxSettings({
                      ...mergeInboxSettings(ib.settings),
                      assignmentMethod,
                    }),
                  }
                : ib,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
        setMemberCounts((prev) => ({ ...prev, [draft.inboxId]: draft.memberIds.length }))
      }
      closeForm()
    } catch (err) {
      setError(err.message || 'Failed to save inbox.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (inboxTarget = null) => {
    const target =
      inboxTarget ??
      (draft.inboxId ? { id: draft.inboxId, name: draft.name } : null)
    if (!target?.id) return
    if (!window.confirm(`Delete team inbox "${target.name}"? This archives the inbox.`)) return
    setSaving(true)
    setError('')
    try {
      await patchOrgInbox(orgId, target.id, { status: 'archived' })
      await load()
      closeForm()
    } catch (err) {
      setError(err.message || 'Failed to delete inbox.')
    } finally {
      setSaving(false)
    }
  }

  const goInviteTeammates = () => {
    const inboxParam =
      expandedId && !isCreatingNew
        ? `?inbox=${encodeURIComponent(expandedId)}`
        : draft.inboxId
          ? `?inbox=${encodeURIComponent(draft.inboxId)}`
          : ''
    navigate(`/org/${orgId}/settings/teammates/invite/new${inboxParam}`)
  }

  if (!canManage) {
    return (
      <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8">
        <p className="text-slate-300">Only organization admins can manage team inboxes.</p>
        <a href={`/org/${orgId}/settings`} className="mt-4 inline-block text-sm text-[#6eb5ff] hover:underline">
          Back to settings
        </a>
      </main>
    )
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[#2b3858] bg-[#151b2e] text-slate-300">
              <SquareStack className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-semibold text-white">Team inboxes</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3858] px-3 py-2 text-sm text-slate-300 hover:bg-[#151b2e]"
            >
              <BookOpen className="h-4 w-4" />
              Learn
              <ChevronDown className="h-4 w-4 opacity-60" />
            </button>
            <button
              type="button"
              onClick={openNewInboxForm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            >
              <Plus className="h-4 w-4" />
              New team inbox
            </button>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 py-12 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading team inboxes…
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#2b3858] bg-[#12192c]">
            {isCreatingNew ? (
              <div className="border-b border-[#2b3858]">
                <div className="flex items-center gap-3 px-4 py-4 sm:px-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20 text-orange-300">
                    <Inbox className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium text-slate-400">New team inbox</span>
                </div>
                <TeamInboxEditor
                  draft={draft}
                  members={members}
                  canManage={canManage}
                  isNew
                  saving={saving}
                  onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                  onToggleMember={toggleDraftMember}
                  onAssignmentMethodChange={(method) =>
                    setDraft((d) => ({ ...d, assignmentMethod: method }))
                  }
                  onSave={handleSave}
                  onCancel={closeForm}
                  onDelete={() => void handleDelete()}
                  onInviteTeammates={goInviteTeammates}
                />
              </div>
            ) : null}

            {inboxes.length === 0 && !isCreatingNew ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-slate-400">No team inboxes yet.</p>
                <button
                  type="button"
                  onClick={openNewInboxForm}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                >
                  <Plus className="h-4 w-4" />
                  New team inbox
                </button>
              </div>
            ) : (
              <ul>
                {inboxes.map((inbox) => {
                  const isExpanded = expandedId === inbox.id && !isCreatingNew
                  const count = memberCounts[inbox.id] ?? 0
                  return (
                    <li key={inbox.id} className="border-b border-[#2b3858] last:border-b-0">
                      <div className="flex items-center gap-1 px-2 py-2 sm:px-4">
                        <button
                          type="button"
                          onClick={() => (isExpanded ? closeForm() : openEditInbox(inbox))}
                          className="flex min-w-0 flex-1 items-center gap-4 rounded-lg px-2 py-2 text-left transition hover:bg-[#151b2e] sm:px-2"
                        >
                          <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${inboxIconColor(inbox.name)}`}
                          >
                            <User className="h-5 w-5" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-white">{inbox.name}</p>
                            <p className="text-sm text-slate-500">
                              {count} member{count === 1 ? '' : 's'}
                            </p>
                          </div>
                          <ChevronRight
                            className={`h-5 w-5 shrink-0 text-slate-500 transition ${isExpanded ? 'rotate-90' : ''}`}
                          />
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleDelete(inbox)
                          }}
                          className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-red-950/40 hover:text-red-400 disabled:opacity-40"
                          aria-label={`Delete ${inbox.name}`}
                          title="Delete team inbox"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {isExpanded ? (
                        <TeamInboxEditor
                          draft={draft}
                          members={members}
                          canManage={canManage}
                          isNew={false}
                          saving={saving}
                          onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                          onToggleMember={toggleDraftMember}
                          onAssignmentMethodChange={(method) =>
                            setDraft((d) => ({ ...d, assignmentMethod: method }))
                          }
                          onSave={handleSave}
                          onCancel={closeForm}
                          onDelete={() => void handleDelete()}
                          onInviteTeammates={goInviteTeammates}
                        />
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
