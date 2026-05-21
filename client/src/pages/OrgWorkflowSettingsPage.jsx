import {
  ArrowDown,
  ArrowUp,
  Bell,
  ChevronRight,
  FlaskConical,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { WORKFLOW_TRIGGERS } from '@ai-support/shared'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import {
  dryRunWorkflow,
  fetchWorkflowMetrics,
  fetchWorkflowRules,
  saveWorkflowRules,
  sendWorkflowTestNotification,
} from '../services/workflowApi.js'

const TRIGGER_LABELS = {
  inbound_message: 'Inbound message',
  sla_warning: 'SLA warning',
  tag_added: 'Tag added',
  schedule: 'Schedule',
}

function newRuleTemplate(sortOrder) {
  return {
    name: 'New rule',
    enabled: true,
    trigger: 'inbound_message',
    sortOrder,
    conditions: {
      op: 'all',
      conditions: [{ field: 'intent', op: 'eq', value: 'general_inquiry' }],
    },
    actions: [{ type: 'notify', channel: 'staff' }],
  }
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-[#2b3858] bg-[#12192c] px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-slate-500">{hint}</p> : null}
    </div>
  )
}

export default function OrgWorkflowSettingsPage() {
  const { orgId } = useParams()
  const { organizations } = useOrganizationContext()
  const current = organizations.find((o) => o.orgId === orgId)
  const isAdmin = String(current?.role ?? '').toUpperCase() === 'ADMIN'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [rules, setRules] = useState([])
  const [schedule, setSchedule] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const [dryConvId, setDryConvId] = useState('')
  const [dryTrigger, setDryTrigger] = useState('inbound_message')
  const [dryTagId, setDryTagId] = useState('')
  const [dryLoading, setDryLoading] = useState(false)
  const [dryResult, setDryResult] = useState(null)
  const [dryError, setDryError] = useState('')

  const [notifyLoading, setNotifyLoading] = useState(false)
  const [notifyMsg, setNotifyMsg] = useState('')

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    try {
      const [rulesRes, metricsRes] = await Promise.all([
        fetchWorkflowRules(orgId),
        fetchWorkflowMetrics(orgId, { days: 7 }),
      ])
      const sorted = [...(rulesRes.rules ?? [])].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      )
      setRules(sorted)
      setSchedule(rulesRes.schedule ?? {})
      setMetrics(metricsRes)
    } catch (e) {
      setError(e.message || 'Failed to load workflow settings.')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave(e) {
    e.preventDefault()
    if (!isAdmin || !orgId) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const data = await saveWorkflowRules(orgId, { rules, schedule })
      const sorted = [...(data.rules ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      setRules(sorted)
      setSchedule(data.schedule ?? schedule)
      setSaved(true)
      const metricsRes = await fetchWorkflowMetrics(orgId, { days: 7 })
      setMetrics(metricsRes)
    } catch (err) {
      setError(err.message || 'Failed to save rules.')
    } finally {
      setSaving(false)
    }
  }

  function moveRule(index, direction) {
    const next = [...rules]
    const swap = index + direction
    if (swap < 0 || swap >= next.length) return
    const aOrder = next[index].sortOrder ?? index
    const bOrder = next[swap].sortOrder ?? swap
    next[index] = { ...next[index], sortOrder: bOrder }
    next[swap] = { ...next[swap], sortOrder: aOrder }
    ;[next[index], next[swap]] = [next[swap], next[index]]
    setRules(next)
  }

  function updateRule(index, patch) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function removeRule(index) {
    setRules((prev) => prev.filter((_, i) => i !== index))
  }

  function addRule() {
    const maxOrder = rules.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), -1)
    setRules((prev) => [...prev, newRuleTemplate(maxOrder + 1)])
  }

  async function runDryRun() {
    if (!orgId || !dryConvId.trim()) {
      setDryError('Conversation ID is required.')
      return
    }
    setDryLoading(true)
    setDryError('')
    setDryResult(null)
    try {
      const body = {
        conversationId: dryConvId.trim(),
        trigger: dryTrigger,
        ...(dryTrigger === 'tag_added' && dryTagId.trim() ? { tagId: dryTagId.trim() } : {}),
      }
      const res = await dryRunWorkflow(orgId, body)
      setDryResult(res)
    } catch (err) {
      setDryError(err.message || 'Dry-run failed.')
    } finally {
      setDryLoading(false)
    }
  }

  async function runTestNotification() {
    if (!orgId || !isAdmin) return
    setNotifyLoading(true)
    setNotifyMsg('')
    setError('')
    try {
      const res = await sendWorkflowTestNotification(orgId)
      setNotifyMsg(res.message || 'Test notification sent.')
    } catch (err) {
      setError(err.message || 'Test notification failed.')
    } finally {
      setNotifyLoading(false)
    }
  }

  const queue = metrics?.queue?.available ? metrics.queue : null
  const events = metrics?.events?.available ? metrics.events : null

  return (
    <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">
              <Link to={`/org/${orgId}/settings/ai`} className="hover:text-slate-300">
                AI &amp; Automation
              </Link>
              <ChevronRight className="mx-1 inline h-3 w-3" aria-hidden />
              <span className="text-slate-400">Workflow rules</span>
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white">Workflow automation</h1>
          </div>
          <Link
            to={`/org/${orgId}/reports`}
            className="text-sm text-[#3ECF8E] hover:underline"
          >
            View Reports →
          </Link>
        </div>

        {!isAdmin ? (
          <p className="mb-4 rounded-lg border border-amber-900/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            Only workspace admins can edit rules. You can run dry-runs and view metrics.
          </p>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-lg border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="mb-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
            Rules saved.
          </p>
        ) : null}
        {notifyMsg ? (
          <p className="mb-4 rounded-lg border border-sky-900/40 bg-sky-950/30 px-4 py-3 text-sm text-sky-200">
            {notifyMsg}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-8">
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Operations (7 days)
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="Queue depth"
                  value={queue ? queue.depth : '—'}
                  hint={queue ? `${queue.pending} pending · ${queue.dead} dead` : metrics?.queue?.message}
                />
                <MetricCard
                  label="Actions applied"
                  value={events?.applied ?? '—'}
                  hint="workflow.action_applied"
                />
                <MetricCard
                  label="Actions skipped"
                  value={events?.skipped ?? '—'}
                  hint="includes enqueue_phase6 stub"
                />
                <MetricCard
                  label="Rules enabled"
                  value={`${metrics?.rules?.enabled ?? 0} / ${metrics?.rules?.total ?? 0}`}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">{metrics?.reportsHint}</p>
            </section>

            {schedule ? (
              <section className="rounded-xl border border-[#2b3858] bg-[#12192c] p-4">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Business hours schedule
                </h2>
                <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="rounded border-[#2b3858] accent-[#3ECF8E]"
                    checked={Boolean(schedule.enabled)}
                    disabled={!isAdmin}
                    onChange={(e) => setSchedule((s) => ({ ...s, enabled: e.target.checked }))}
                  />
                  Enable schedule trigger scans (cron)
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-slate-400">
                    Timezone
                    <input
                      type="text"
                      value={schedule.timezone ?? 'UTC'}
                      disabled={!isAdmin}
                      onChange={(e) => setSchedule((s) => ({ ...s, timezone: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white disabled:opacity-60"
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Window (local)
                    <div className="mt-1 flex gap-2">
                      <input
                        type="text"
                        placeholder="09:00"
                        value={schedule.start ?? '09:00'}
                        disabled={!isAdmin}
                        onChange={(e) => setSchedule((s) => ({ ...s, start: e.target.value }))}
                        className="w-full rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white disabled:opacity-60"
                      />
                      <span className="self-center text-slate-500">–</span>
                      <input
                        type="text"
                        placeholder="17:00"
                        value={schedule.end ?? '17:00'}
                        disabled={!isAdmin}
                        onChange={(e) => setSchedule((s) => ({ ...s, end: e.target.value }))}
                        className="w-full rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white disabled:opacity-60"
                      />
                    </div>
                  </label>
                </div>
              </section>
            ) : null}

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rules</h2>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={addRule}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#3ECF8E]/40 px-2 py-1 text-xs text-[#7ee8b5] hover:bg-[#3ECF8E]/10"
                  >
                    <Plus size={12} /> Add rule
                  </button>
                ) : null}
              </div>
              <div className="space-y-2">
                {rules.length === 0 ? (
                  <p className="text-sm text-slate-400">No rules yet. Add a rule to get started.</p>
                ) : (
                  rules.map((rule, index) => {
                    const key = rule.id ?? `rule-${index}`
                    const expanded = expandedId === key
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-[#2b3858] bg-[#12192c] p-3"
                      >
                        <div className="flex flex-wrap items-start gap-2">
                          <GripVertical size={14} className="mt-1 text-slate-600" aria-hidden />
                          <label className="flex shrink-0 items-center gap-2 pt-0.5">
                            <input
                              type="checkbox"
                              checked={rule.enabled !== false}
                              disabled={!isAdmin}
                              onChange={(e) => updateRule(index, { enabled: e.target.checked })}
                              className="rounded accent-[#3ECF8E]"
                            />
                            <span className="sr-only">Enabled</span>
                          </label>
                          <div className="min-w-0 flex-1">
                            <input
                              type="text"
                              value={rule.name ?? ''}
                              disabled={!isAdmin}
                              onChange={(e) => updateRule(index, { name: e.target.value })}
                              className="w-full rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1 text-sm font-medium text-white disabled:opacity-60"
                            />
                            <select
                              value={rule.trigger ?? 'inbound_message'}
                              disabled={!isAdmin}
                              onChange={(e) => updateRule(index, { trigger: e.target.value })}
                              className="mt-2 w-full rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1 text-xs text-slate-300 disabled:opacity-60"
                            >
                              {WORKFLOW_TRIGGERS.map((t) => (
                                <option key={t} value={t}>
                                  {TRIGGER_LABELS[t] ?? t}
                                </option>
                              ))}
                            </select>
                          </div>
                          {isAdmin ? (
                            <div className="flex shrink-0 flex-col gap-1">
                              <button
                                type="button"
                                title="Move up"
                                disabled={index === 0}
                                onClick={() => moveRule(index, -1)}
                                className="rounded p-1 text-slate-400 hover:bg-[#1a2440] disabled:opacity-30"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                title="Move down"
                                disabled={index === rules.length - 1}
                                onClick={() => moveRule(index, 1)}
                                className="rounded p-1 text-slate-400 hover:bg-[#1a2440] disabled:opacity-30"
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                type="button"
                                title="Remove"
                                onClick={() => removeRule(index)}
                                className="rounded p-1 text-rose-400 hover:bg-rose-950/40"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="mt-2 text-xs text-slate-500 hover:text-slate-300"
                          onClick={() => setExpandedId(expanded ? null : key)}
                        >
                          {expanded ? 'Hide' : 'Edit'} conditions &amp; actions (JSON)
                        </button>
                        {expanded && isAdmin ? (
                          <div className="mt-2 space-y-2">
                            <label className="block text-xs text-slate-500">
                              Conditions
                              <textarea
                                rows={6}
                                className="mt-1 w-full rounded-md border border-[#334060] bg-[#0f1728] p-2 font-mono text-xs text-slate-200"
                                value={JSON.stringify(rule.conditions ?? {}, null, 2)}
                                onChange={(e) => {
                                  try {
                                    updateRule(index, { conditions: JSON.parse(e.target.value) })
                                  } catch {
                                    /* ignore parse while typing */
                                  }
                                }}
                              />
                            </label>
                            <label className="block text-xs text-slate-500">
                              Actions
                              <textarea
                                rows={4}
                                className="mt-1 w-full rounded-md border border-[#334060] bg-[#0f1728] p-2 font-mono text-xs text-slate-200"
                                value={JSON.stringify(rule.actions ?? [], null, 2)}
                                onChange={(e) => {
                                  try {
                                    updateRule(index, { actions: JSON.parse(e.target.value) })
                                  } catch {
                                    /* ignore */
                                  }
                                }}
                              />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            <section className="rounded-xl border border-[#2b3858] bg-[#12192c] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <FlaskConical size={14} /> Simulation (dry-run)
              </h2>
              <p className="mb-3 text-xs text-slate-400">
                Evaluates rules against a conversation without applying actions. Use a real conversation
                UUID from the inbox.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-slate-400 sm:col-span-2">
                  Conversation ID
                  <input
                    type="text"
                    value={dryConvId}
                    onChange={(e) => setDryConvId(e.target.value)}
                    placeholder="uuid"
                    className="mt-1 w-full rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 font-mono text-sm text-white"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Trigger
                  <select
                    value={dryTrigger}
                    onChange={(e) => setDryTrigger(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white"
                  >
                    {WORKFLOW_TRIGGERS.map((t) => (
                      <option key={t} value={t}>
                        {TRIGGER_LABELS[t] ?? t}
                      </option>
                    ))}
                  </select>
                </label>
                {dryTrigger === 'tag_added' ? (
                  <label className="block text-xs text-slate-400">
                    Tag ID
                    <input
                      type="text"
                      value={dryTagId}
                      onChange={(e) => setDryTagId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 font-mono text-sm text-white"
                    />
                  </label>
                ) : null}
              </div>
              <button
                type="button"
                disabled={dryLoading}
                onClick={() => void runDryRun()}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-950/40 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-950/60 disabled:opacity-40"
              >
                {dryLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Run dry-run
              </button>
              {dryError ? <p className="mt-2 text-xs text-rose-300">{dryError}</p> : null}
              {dryResult ? (
                <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-[#334060] bg-[#0f1728] p-3 text-xs text-slate-300">
                  {JSON.stringify(dryResult, null, 2)}
                </pre>
              ) : null}
            </section>

            {isAdmin ? (
              <section className="rounded-xl border border-[#2b3858] bg-[#12192c] p-4">
                <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Bell size={14} /> Test notification
                </h2>
                <p className="mb-3 text-xs text-slate-400">
                  Sends a one-off email using the same provider as workflow <code>notify</code>{' '}
                  actions. Requires inbound staff email to be enabled under Automation settings.
                </p>
                <button
                  type="button"
                  disabled={notifyLoading}
                  onClick={() => void runTestNotification()}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#3ECF8E]/40 px-3 py-1.5 text-xs font-medium text-[#7ee8b5] hover:bg-[#3ECF8E]/10 disabled:opacity-40"
                >
                  {notifyLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                  Send test email
                </button>
              </section>
            ) : null}

            <p className="rounded-lg border border-violet-900/30 bg-violet-950/20 px-4 py-3 text-xs text-violet-200">
              <strong>Phase 6 boundary:</strong> Rules with <code>enqueue_phase6</code> are always
              skipped until autonomous replies ship. No customer-visible AI messages are sent from
              Phase 4 paths.
            </p>

            {isAdmin ? (
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#3ECF8E] px-4 py-2.5 text-sm font-semibold text-[#0b1020] transition hover:bg-[#35b87d] disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save rules'}
              </button>
            ) : null}
          </form>
        )}
      </div>
    </main>
  )
}
