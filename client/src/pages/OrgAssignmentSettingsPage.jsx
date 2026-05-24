import { GitBranch, Loader2, Plus, Save, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import {
  fetchAgentAssignmentConfig,
  fetchOrgAssignmentSettings,
  putAgentAssignmentConfig,
  putOrgAssignmentSettings,
} from '../services/assignmentApi.js'
import { fetchOrgMembers } from '../services/orgWorkspaceApi.js'

const STRATEGIES = [
  { value: 'weighted_hybrid', label: 'Weighted hybrid (recommended)' },
  { value: 'least_loaded', label: 'Least loaded' },
  { value: 'round_robin', label: 'Round robin' },
  { value: 'skill_based', label: 'Skill based' },
]

function ToggleRow({ label, description, checked, onChange, disabled }) {
  return (
    <label
      className={`flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-[#2b3858] bg-[#12192c] px-4 py-3 ${
        disabled ? 'cursor-not-allowed opacity-60' : ''
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="text-sm font-medium text-white">{label}</span>
        {description ? (
          <p className="mt-1 text-xs leading-snug text-slate-400">{description}</p>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 rounded border-[#2b3858] bg-[#0e1526] accent-[#3ECF8E]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
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
  const isAdmin = String(current?.role ?? '').toUpperCase() === 'ADMIN'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [assignment, setAssignment] = useState(null)

  const [members, setMembers] = useState([])
  const [skillsMemberId, setSkillsMemberId] = useState('')
  const [agentConfig, setAgentConfig] = useState(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentSaving, setAgentSaving] = useState(false)
  const [agentError, setAgentError] = useState('')
  const [agentSaved, setAgentSaved] = useState(false)

  const [skillDraft, setSkillDraft] = useState({ skill: '', proficiency: 50 })

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    try {
      const [settingsRes, membersRes] = await Promise.all([
        fetchOrgAssignmentSettings(orgId),
        fetchOrgMembers(orgId),
      ])
      setAssignment(settingsRes?.assignment ?? {})
      const list = Array.isArray(membersRes?.members) ? membersRes.members : []
      setMembers(list)
      if (!skillsMemberId && list[0]?.id) setSkillsMemberId(list[0].id)
    } catch (e) {
      setError(e.message || 'Failed to load assignment settings.')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const loadAgentConfig = useCallback(async () => {
    if (!orgId || !skillsMemberId || !isAdmin) return
    setAgentLoading(true)
    setAgentError('')
    try {
      const cfg = await fetchAgentAssignmentConfig(orgId, skillsMemberId)
      setAgentConfig(cfg)
    } catch (e) {
      setAgentConfig(null)
      setAgentError(e.message || 'Failed to load agent profile.')
    } finally {
      setAgentLoading(false)
    }
  }, [orgId, skillsMemberId, isAdmin])

  useEffect(() => {
    loadAgentConfig()
  }, [loadAgentConfig])

  const vipTagsText = useMemo(() => {
    if (!assignment?.vip_tag_names) return 'vip, enterprise'
    return assignment.vip_tag_names.join(', ')
  }, [assignment?.vip_tag_names])

  async function handleSaveOrg(e) {
    e.preventDefault()
    if (!isAdmin || !assignment || !orgId) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const vip_tag_names = vipTagsText
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
      const res = await putOrgAssignmentSettings(orgId, { ...assignment, vip_tag_names })
      setAssignment(res?.assignment ?? assignment)
      setSaved(true)
    } catch (err) {
      setError(err.message || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAgent(e) {
    e.preventDefault()
    if (!isAdmin || !orgId || !skillsMemberId || !agentConfig) return
    setAgentSaving(true)
    setAgentError('')
    setAgentSaved(false)
    try {
      const res = await putAgentAssignmentConfig(orgId, skillsMemberId, {
        profile: agentConfig.profile,
        skills: agentConfig.skills.map((s) => ({
          skill: s.skill,
          proficiency: s.proficiency,
        })),
      })
      setAgentConfig(res)
      setAgentSaved(true)
    } catch (err) {
      setAgentError(err.message || 'Failed to save agent config.')
    } finally {
      setAgentSaving(false)
    }
  }

  function addSkill() {
    const skill = skillDraft.skill.trim().toLowerCase()
    if (!skill || !agentConfig) return
    if (agentConfig.skills.some((s) => s.skill === skill)) {
      setAgentError('Skill already exists for this teammate.')
      return
    }
    setAgentConfig({
      ...agentConfig,
      skills: [...agentConfig.skills, { skill, proficiency: Number(skillDraft.proficiency) || 50 }],
    })
    setSkillDraft({ skill: '', proficiency: 50 })
    setAgentError('')
  }

  function removeSkill(skill) {
    if (!agentConfig) return
    setAgentConfig({
      ...agentConfig,
      skills: agentConfig.skills.filter((s) => s.skill !== skill),
    })
  }

  if (!isAdmin) {
    return (
      <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
        <p className="text-sm text-slate-400">Only organization admins can configure assignment.</p>
      </main>
    )
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl">
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
          Intelligent routing runs after AI classification and workflow rules. Workflow{' '}
          <code className="text-slate-300">set_assignment</code> sets an explicit target; auto-route
          scores eligible agents.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : !assignment ? null : (
          <form onSubmit={handleSaveOrg} className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Auto-route
              </h2>
              <ToggleRow
                label="Enable server auto-route"
                description="After classify + workflow, assign unassigned threads using scoring (requires AI enabled)."
                checked={Boolean(assignment.auto_route_enabled)}
                onChange={(v) => setAssignment({ ...assignment, auto_route_enabled: v })}
              />
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                Scoring strategy
                <select
                  value={assignment.strategy ?? 'weighted_hybrid'}
                  onChange={(e) => setAssignment({ ...assignment, strategy: e.target.value })}
                  className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                >
                  {STRATEGIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
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

            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                SLA &amp; reassignment
              </h2>
              <ToggleRow
                label="SLA-urgent routing"
                description="When first-response SLA is almost due, prefer agents with the lowest active chat load."
                checked={Boolean(assignment.sla_routing_enabled)}
                onChange={(v) => setAssignment({ ...assignment, sla_routing_enabled: v })}
              />
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                SLA urgent threshold (minutes remaining)
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={assignment.sla_remaining_minutes_threshold ?? 5}
                  onChange={(e) =>
                    setAssignment({
                      ...assignment,
                      sla_remaining_minutes_threshold: Number(e.target.value),
                    })
                  }
                  className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                />
              </label>
              <ToggleRow
                label="Enable reassignment"
                checked={Boolean(assignment.reassign_enabled)}
                onChange={(v) => setAssignment({ ...assignment, reassign_enabled: v })}
              />
              <ToggleRow
                label="Reassign on SLA warning"
                checked={Boolean(assignment.reassign_on_sla_warning)}
                onChange={(v) => setAssignment({ ...assignment, reassign_on_sla_warning: v })}
                disabled={!assignment.reassign_enabled}
              />
              <ToggleRow
                label="Reassign when assignee goes offline"
                checked={Boolean(assignment.reassign_on_agent_offline)}
                onChange={(v) => setAssignment({ ...assignment, reassign_on_agent_offline: v })}
                disabled={!assignment.reassign_enabled}
              />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">VIP</h2>
              <ToggleRow
                label="VIP routing"
                description="Conversations with VIP tags require higher skill proficiency and optional inbox override."
                checked={Boolean(assignment.vip_routing_enabled)}
                onChange={(v) => setAssignment({ ...assignment, vip_routing_enabled: v })}
              />
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                VIP tag names (comma-separated)
                <input
                  type="text"
                  value={vipTagsText}
                  onChange={(e) => {
                    const vip_tag_names = e.target.value
                      .split(',')
                      .map((t) => t.trim().toLowerCase())
                      .filter(Boolean)
                    setAssignment({ ...assignment, vip_tag_names })
                  }}
                  className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                Minimum proficiency for VIP
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={assignment.vip_min_proficiency ?? 70}
                  onChange={(e) =>
                    setAssignment({ ...assignment, vip_min_proficiency: Number(e.target.value) })
                  }
                  className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                />
              </label>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Fallback notifications
              </h2>
              <p className="text-xs text-slate-500">
                When auto-route finds no eligible agent, these teammates can be notified (stored for
                future notify integration).
              </p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-[#2b3858] bg-[#12192c] p-3">
                {members.length === 0 ? (
                  <p className="text-xs text-slate-500">No members loaded.</p>
                ) : (
                  members.map((m) => {
                    const ids = assignment.fallback_notify_member_ids ?? []
                    const checked = ids.includes(m.id)
                    return (
                      <label
                        key={m.id}
                        className="flex cursor-pointer items-center gap-2 py-1 text-sm text-slate-300"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...ids, m.id]
                              : ids.filter((id) => id !== m.id)
                            setAssignment({ ...assignment, fallback_notify_member_ids: next })
                          }}
                          className="accent-[#3ECF8E]"
                        />
                        {memberLabel(m)}
                      </label>
                    )
                  })
                )}
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

        <section className="mt-10 flex flex-col gap-4 border-t border-[#27314a] pt-8">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-white">Agent skills</h2>
          </div>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Teammate
            <select
              value={skillsMemberId}
              onChange={(e) => setSkillsMemberId(e.target.value)}
              className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberLabel(m)}
                </option>
              ))}
            </select>
          </label>

          {agentLoading ? (
            <p className="text-xs text-slate-500">Loading agent profile…</p>
          ) : agentConfig ? (
            <form onSubmit={handleSaveAgent} className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Max concurrency
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={agentConfig.profile?.maxConcurrency ?? 5}
                    onChange={(e) =>
                      setAgentConfig({
                        ...agentConfig,
                        profile: {
                          ...agentConfig.profile,
                          maxConcurrency: Number(e.target.value),
                        },
                      })
                    }
                    className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Routing status
                  <select
                    value={agentConfig.profile?.status ?? 'active'}
                    onChange={(e) =>
                      setAgentConfig({
                        ...agentConfig,
                        profile: { ...agentConfig.profile, status: e.target.value },
                      })
                    }
                    className="rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>

              <ul className="flex flex-col gap-2">
                {(agentConfig.skills ?? []).map((s) => (
                  <li
                    key={s.skill}
                    className="flex items-center justify-between gap-2 rounded-md border border-[#2b3858] bg-[#12192c] px-3 py-2 text-sm"
                  >
                    <span className="text-white">
                      {s.skill}{' '}
                      <span className="text-slate-500">({s.proficiency}%)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSkill(s.skill)}
                      className="text-red-300 hover:text-red-200"
                      aria-label={`Remove ${s.skill}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="Skill name"
                  value={skillDraft.skill}
                  onChange={(e) => setSkillDraft({ ...skillDraft, skill: e.target.value })}
                  className="min-w-[120px] flex-1 rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={skillDraft.proficiency}
                  onChange={(e) =>
                    setSkillDraft({ ...skillDraft, proficiency: Number(e.target.value) })
                  }
                  className="w-20 rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className="inline-flex items-center gap-1 rounded-md border border-[#334060] px-3 py-2 text-sm text-white hover:bg-[#1a2540]"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              {agentError ? (
                <p className="text-sm text-red-300" role="alert">
                  {agentError}
                </p>
              ) : null}
              {agentSaved ? <p className="text-sm text-emerald-400">Agent saved.</p> : null}

              <button
                type="submit"
                disabled={agentSaving}
                className="inline-flex w-fit items-center gap-2 rounded-md border border-[#3ECF8E] px-4 py-2 text-sm text-[#3ECF8E] hover:bg-[#3ECF8E]/10 disabled:opacity-50"
              >
                {agentSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save teammate routing
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </main>
  )
}
