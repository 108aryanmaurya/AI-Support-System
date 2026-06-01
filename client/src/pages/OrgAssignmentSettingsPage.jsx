import {
  defaultAssigneeSelectValue,
  parseDefaultAssigneeSelectValue,
} from '@ai-support/shared'
import { ChevronDown, GitBranch, Inbox, Loader2, Save, User } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { useWorkspaceCanManage } from '../hooks/useWorkspaceCanManage.js'
import { fetchOrgAssignmentSettings, putOrgAssignmentSettings } from '../services/assignmentApi.js'
import { fetchOrgInboxes } from '../services/inboxesApi.js'
import { fetchOrgMembers } from '../services/orgWorkspaceApi.js'

function SettingsSplitCard({ title, description, children }) {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-[#2b3858] bg-[#12192c] px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 max-w-lg flex-1">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">{description}</p>
      </div>
      <div className="w-full shrink-0 lg:max-w-xs lg:pt-0.5">{children}</div>
    </div>
  )
}

/** `organization_members.id` from GET `/api/org/:orgId/members` (`membershipId`). */
function memberRowId(m) {
  return (typeof m?.membershipId === 'string' && m.membershipId) || (typeof m?.id === 'string' && m.id) || ''
}

function memberLabel(m) {
  const fn = typeof m.firstName === 'string' ? m.firstName.trim() : ''
  const ln = typeof m.lastName === 'string' ? m.lastName.trim() : ''
  const combined = `${fn} ${ln}`.trim()
  if (combined) return combined
  if (typeof m.email === 'string' && m.email.includes('@')) {
    return m.email.split('@')[0]
  }
  return 'Teammate'
}

export default function OrgAssignmentSettingsPage() {
  const { orgId } = useParams()
  const { organizations } = useOrganizationContext()
  const current = organizations.find((o) => o.orgId === orgId)
  const canManage = useWorkspaceCanManage(orgId)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [assignment, setAssignment] = useState(null)

  const [members, setMembers] = useState([])
  const [inboxes, setInboxes] = useState([])

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    try {
      const [settingsRes, membersRes, inboxesRes] = await Promise.all([
        fetchOrgAssignmentSettings(orgId),
        fetchOrgMembers(orgId),
        fetchOrgInboxes(orgId),
      ])
      const loaded = settingsRes?.assignment ?? {}
      setAssignment({
        ...loaded,
        default_assignee: loaded.default_assignee ?? { type: 'unassigned' },
        self_assign_on_reply: loaded.self_assign_on_reply ?? 'assign_to_me',
      })
      setMembers(Array.isArray(membersRes?.members) ? membersRes.members : [])
      setInboxes(Array.isArray(inboxesRes?.inboxes) ? inboxesRes.inboxes : [])
    } catch (e) {
      setError(e.message || 'Failed to load assignment settings.')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const defaultAssigneeValue = useMemo(() => {
    if (!assignment) return 'unassigned'
    return defaultAssigneeSelectValue(assignment.default_assignee)
  }, [assignment])

  async function handleSaveOrg(e) {
    e.preventDefault()
    if (!canManage || !assignment || !orgId) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const { strategy: _omitStrategy, fallback_notify_member_ids: _omitFallback, ...assignmentPatch } =
        assignment
      const res = await putOrgAssignmentSettings(orgId, {
        ...assignmentPatch,
        default_assignee: assignment.default_assignee ?? { type: 'unassigned' },
        self_assign_on_reply: assignment.self_assign_on_reply ?? 'assign_to_me',
      })
      const savedAssignment = res?.assignment ?? assignment
      setAssignment({
        ...savedAssignment,
        default_assignee: savedAssignment.default_assignee ?? { type: 'unassigned' },
        self_assign_on_reply: savedAssignment.self_assign_on_reply ?? 'assign_to_me',
      })
      setSaved(true)
    } catch (err) {
      setError(err.message || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) {
    return (
      <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
        <p className="text-sm text-slate-400">Only organization admins can configure assignment.</p>
      </main>
    )
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[#2b3858] bg-[#151b2e] text-emerald-300">
              <GitBranch className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-semibold text-white">Assignment</h1>
          </div>
          <Link
            to={`/org/${orgId}/settings/workflows`}
            className="text-xs text-slate-400 hover:text-[#3ECF8E]"
          >
            Workflow rules →
          </Link>
        </div>

        <p className="mb-6 text-sm text-slate-400">
          Org-wide defaults for routing and agent profiles. Per-inbox assignment
          (manual, round robin, balanced) is configured under{' '}
          <Link to={`/org/${orgId}/settings/inboxes`} className="text-[#6eb5ff] hover:underline">
            Team inboxes
          </Link>
          . Workflow <code className="text-slate-300">set_assignment</code> still sets explicit targets.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : !assignment ? null : (
          <form onSubmit={handleSaveOrg} className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
              <SettingsSplitCard
                title="Default assignee"
                description="When round robin or balanced auto-assignment cannot assign an agent, the conversation is assigned to this default team inbox or teammate."
              >
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-slate-500">Select a team inbox or teammate</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-slate-400">
                      {defaultAssigneeValue.startsWith('inbox:') ? (
                        <Inbox className="h-4 w-4" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </span>
                    <select
                      value={defaultAssigneeValue}
                      onChange={(e) => {
                        const parsed = parseDefaultAssigneeSelectValue(e.target.value)
                        setAssignment({ ...assignment, default_assignee: parsed })
                      }}
                      className="w-full appearance-none rounded-full border border-[#334060] bg-[#0f1728] py-2.5 pl-10 pr-10 text-sm text-white"
                    >
                      <option value="unassigned">Unassigned</option>
                      {inboxes.map((inbox) => (
                        <option key={inbox.id} value={`inbox:${inbox.id}`}>
                          {inbox.name?.trim() || 'Team inbox'}
                        </option>
                      ))}
                      {members.map((m) => {
                        const mid = memberRowId(m)
                        if (!mid) return null
                        return (
                          <option key={mid} value={`member:${mid}`}>
                            {memberLabel(m)}
                          </option>
                        )
                      })}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
              </SettingsSplitCard>

              <SettingsSplitCard
                title="Self-assign by replying"
                description={
                  <>
                    Choose what happens when you reply to a conversation that is unassigned or assigned
                    to a team inbox.{' '}
                    <a
                      href="https://www.intercom.com/legal/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#6eb5ff] hover:underline"
                    >
                      Privacy Policy
                    </a>
                  </>
                }
              >
                <fieldset className="flex flex-col gap-3">
                  <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200">
                    <input
                      type="radio"
                      name="self_assign_on_reply"
                      className="h-4 w-4 border-[#334060] bg-[#0f1728] accent-[#3b82f6]"
                      checked={assignment.self_assign_on_reply === 'assign_to_me'}
                      onChange={() =>
                        setAssignment({ ...assignment, self_assign_on_reply: 'assign_to_me' })
                      }
                    />
                    Assign it to me
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200">
                    <input
                      type="radio"
                      name="self_assign_on_reply"
                      className="mt-0.5 h-4 w-4 shrink-0 border-[#334060] bg-[#0f1728] accent-[#3b82f6]"
                      checked={assignment.self_assign_on_reply === 'keep_queue'}
                      onChange={() =>
                        setAssignment({ ...assignment, self_assign_on_reply: 'keep_queue' })
                      }
                    />
                    <span>Keep it unassigned or assigned to the team inbox</span>
                  </label>
                </fieldset>
              </SettingsSplitCard>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Defaults for new agents
              </h2>
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                Default max concurrency
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={assignment.default_max_concurrency ?? 5}
                  onChange={(e) =>
                    setAssignment({
                      ...assignment,
                      default_max_concurrency: Number(e.target.value),
                    })
                  }
                  className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Shift start (HH:MM)
                  <input
                    type="text"
                    placeholder="09:00"
                    value={assignment.default_shift_start ?? ''}
                    onChange={(e) =>
                      setAssignment({ ...assignment, default_shift_start: e.target.value || null })
                    }
                    className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Shift end
                  <input
                    type="text"
                    placeholder="17:00"
                    value={assignment.default_shift_end ?? ''}
                    onChange={(e) =>
                      setAssignment({ ...assignment, default_shift_end: e.target.value || null })
                    }
                    className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Timezone
                  <input
                    type="text"
                    value={assignment.default_timezone ?? 'UTC'}
                    onChange={(e) =>
                      setAssignment({ ...assignment, default_timezone: e.target.value })
                    }
                    className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
            </section>

            {error ? (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}
            {saved ? <p className="text-sm text-emerald-400">Settings saved.</p> : null}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#3ECF8E] px-4 py-2 text-sm font-medium text-[#0a0f1a] hover:bg-[#35b87d] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save assignment settings
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
