import { Bot, Loader2, Save } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { useWorkspaceCanManage } from '../hooks/useWorkspaceCanManage.js'
import { getAiHealth } from '../services/aiApi.js'
import { fetchOrgAiSettings, patchOrgAiSettings } from '../services/orgSettingsApi.js'

function ToggleRow({ label, description, checked, onChange, disabled, phase }) {
  return (
    <label
      className={`flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-[#2b3858] bg-[#12192c] px-4 py-3 ${
        disabled ? 'cursor-not-allowed opacity-60' : ''
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-white">{label}</span>
          {phase ? (
            <span className="rounded-md bg-violet-950/80 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
              {phase}
            </span>
          ) : null}
        </span>
        {description ? <p className="mt-1 text-xs leading-snug text-slate-400">{description}</p> : null}
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

export default function OrgAiSettingsPage() {
  const { orgId } = useParams()
  const { organizations } = useOrganizationContext()
  const current = organizations.find((o) => o.orgId === orgId)
  const canManage = useWorkspaceCanManage(orgId)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [ai, setAi] = useState(null)
  const [automation, setAutomation] = useState(null)
  const [ingress, setIngress] = useState(null)
  const [llmHealth, setLlmHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthError, setHealthError] = useState('')

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchOrgAiSettings(orgId)
      setAi(data.ai ?? {})
      setAutomation(data.automation ?? {})
      setIngress(data.ingress ?? {})
    } catch (e) {
      setError(e.message || 'Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  async function runHealthCheck() {
    if (!orgId) return
    setHealthLoading(true)
    setHealthError('')
    try {
      const res = await getAiHealth(orgId)
      setLlmHealth(res)
    } catch (e) {
      setLlmHealth(null)
      setHealthError(e.message || 'Health check failed.')
    } finally {
      setHealthLoading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!canManage || !ai || !automation || !ingress) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const data = await patchOrgAiSettings(orgId, { ai, automation, ingress })
      setAi(data.ai)
      setAutomation(data.automation)
      setIngress(data.ingress)
      setSaved(true)
    } catch (err) {
      setError(err.message || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const masterOff = ai && !ai.ai_enabled

  return (
    <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[#2b3858] bg-[#151b2e] text-violet-300">
              <Bot className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-semibold text-white">AI &amp; Automation</h1>
          </div>
          <Link
            to={`/org/${orgId}/settings`}
            className="text-sm text-slate-400 transition hover:text-slate-200"
          >
            ← Settings home
          </Link>
        </div>

        {!canManage ? (
          <p className="mb-4 rounded-lg border border-amber-900/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            Only workspace admins can change these settings. You can view current values below.
          </p>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-lg border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        ) : null}

        {saved ? (
          <p className="mb-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
            Settings saved.
          </p>
        ) : null}

        {loading || !ai || !automation ? (
          <p className="text-sm text-slate-400">Loading settings…</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-8">
            <section className="rounded-xl border border-[#2b3858] bg-[#12192c] p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                LLM provider (server)
              </h2>
              <p className="text-xs leading-relaxed text-slate-400">
                Copilot and classification use API keys configured on the server, not in this UI.
                Set <code className="text-slate-300">LLM_PROVIDER</code> and{' '}
                <code className="text-slate-300">LLM_API_KEY</code> in{' '}
                <code className="text-slate-300">server/.env</code> (see{' '}
                <code className="text-slate-300">server/.env.example</code>).
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={healthLoading || !orgId}
                  onClick={() => void runHealthCheck()}
                  className="inline-flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-950/40 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-950/60 disabled:opacity-40"
                >
                  {healthLoading ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                  ) : null}
                  Test AI connection
                </button>
                {llmHealth?.llmConfigured ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    Configured
                    {llmHealth.llmProviderLabel
                      ? ` · ${llmHealth.llmProviderLabel}`
                      : ''}
                    {llmHealth.llmModel ? ` · ${llmHealth.llmModel}` : ''}
                  </span>
                ) : llmHealth && !llmHealth.llmConfigured ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                    Not configured on server
                  </span>
                ) : null}
              </div>
              {healthError ? <p className="mt-2 text-xs text-rose-300">{healthError}</p> : null}
            </section>

            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                AI capabilities
              </h2>
              <div className="space-y-2">
                <ToggleRow
                  label="Enable AI for this workspace"
                  description="Master switch. When off, AI assignment and per-conversation AI are blocked."
                  checked={ai.ai_enabled}
                  disabled={!canManage}
                  onChange={(v) => setAi((prev) => ({ ...prev, ai_enabled: v }))}
                />
                <ToggleRow
                  label="AI assist (Copilot)"
                  description="Suggest replies, summarize threads, and rewrite tone in the inbox."
                  phase="Phase 3"
                  checked={ai.assist_enabled}
                  disabled={!canManage || masterOff}
                  onChange={(v) => setAi((prev) => ({ ...prev, assist_enabled: v }))}
                />
                <ToggleRow
                  label="Auto-tag conversations"
                  description={
                    <>
                      Apply AI-suggested labels to conversations when they match tag definitions.{' '}
                      <Link to={`/org/${orgId}/settings/tags`} className="text-[#3ECF8E] hover:underline">
                        Manage tags
                      </Link>
                      .
                    </>
                  }
                  phase="Phase 3–4"
                  checked={ai.auto_tag_enabled}
                  disabled={!canManage || masterOff}
                  onChange={(v) => setAi((prev) => ({ ...prev, auto_tag_enabled: v }))}
                />
                <ToggleRow
                  label="Workflow automation"
                  description={
                    <>
                      Run Phase 4 routing rules via the automation worker (inbound, tags, SLA triggers).{' '}
                      <Link
                        to={`/org/${orgId}/settings/workflows`}
                        className="text-[#3ECF8E] hover:underline"
                      >
                        Manage rules
                      </Link>
                      .
                    </>
                  }
                  phase="Phase 4"
                  checked={ai.workflow_automation_enabled}
                  disabled={!canManage || masterOff}
                  onChange={(v) => setAi((prev) => ({ ...prev, workflow_automation_enabled: v }))}
                />
                <ToggleRow
                  label="Auto-route to AI queue"
                  description="Assign unassigned conversations to the AI queue when rules match."
                  phase="Phase 4"
                  checked={ai.auto_route_to_ai}
                  disabled={!canManage || masterOff}
                  onChange={(v) => setAi((prev) => ({ ...prev, auto_route_to_ai: v }))}
                />
                <ToggleRow
                  label="Autonomous customer replies"
                  description="Allow AI to send customer-visible messages with approval guardrails."
                  phase="Phase 6"
                  checked={ai.autonomous_replies_enabled}
                  disabled={!canManage || masterOff}
                  onChange={(v) => setAi((prev) => ({ ...prev, autonomous_replies_enabled: v }))}
                />
                <ToggleRow
                  label="AI enabled on new conversations"
                  description="Default for conversations.ai_enabled when a thread is created."
                  checked={ai.default_conversation_ai_enabled}
                  disabled={!canManage || masterOff}
                  onChange={(v) =>
                    setAi((prev) => ({ ...prev, default_conversation_ai_enabled: v }))
                  }
                />
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-400">Model tier (future)</span>
                <select
                  value={ai.model_tier}
                  disabled={!canManage || masterOff}
                  onChange={(e) => setAi((prev) => ({ ...prev, model_tier: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white disabled:opacity-60"
                >
                  <option value="standard">Standard</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
            </section>

            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Ingress policy
              </h2>
              <div className="space-y-2">
                <ToggleRow
                  label="Spam heuristics"
                  description="Flag or reject noisy inbound messages (blocklist, links, shouting)."
                  phase="Phase 4"
                  checked={ingress.spam_enabled}
                  disabled={!canManage}
                  onChange={(v) => setIngress((prev) => ({ ...prev, spam_enabled: v }))}
                />
                <ToggleRow
                  label="Hard reject spam"
                  description="When on, spam is rejected with HTTP 422 instead of flagged in the Spam inbox."
                  phase="Phase 4"
                  checked={ingress.spam_action === 'reject'}
                  disabled={!canManage || !ingress.spam_enabled}
                  onChange={(v) =>
                    setIngress((prev) => ({ ...prev, spam_action: v ? 'reject' : 'flag' }))
                  }
                />
                <ToggleRow
                  label="Duplicate detection"
                  description="Suppress repeat customer messages with the same content within the time window."
                  phase="Phase 4"
                  checked={ingress.duplicate_enabled}
                  disabled={!canManage}
                  onChange={(v) => setIngress((prev) => ({ ...prev, duplicate_enabled: v }))}
                />
              </div>
              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-400">Duplicate window (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={ingress.duplicate_window_minutes}
                  disabled={!canManage || !ingress.duplicate_enabled}
                  onChange={(e) =>
                    setIngress((prev) => ({
                      ...prev,
                      duplicate_window_minutes: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full max-w-[200px] rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white disabled:opacity-60"
                />
              </label>
            </section>

            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Automation &amp; notifications
              </h2>
              <div className="space-y-2">
                <ToggleRow
                  label="Email on new customer message"
                  description="Notify assignee or admin when a customer sends a message."
                  checked={automation.inbound_notify_enabled}
                  disabled={!canManage}
                  onChange={(v) =>
                    setAutomation((prev) => ({ ...prev, inbound_notify_enabled: v }))
                  }
                />
                <ToggleRow
                  label="Email on assignment"
                  description="Notify the teammate when a conversation is assigned to them."
                  checked={automation.assignment_notify_enabled}
                  disabled={!canManage}
                  onChange={(v) =>
                    setAutomation((prev) => ({ ...prev, assignment_notify_enabled: v }))
                  }
                />
                <ToggleRow
                  label="Email when @mentioned on internal note"
                  description="Notify teammates when another agent mentions them on a conversation (default on)."
                  checked={automation.mention_notify_enabled ?? true}
                  disabled={!canManage}
                  onChange={(v) =>
                    setAutomation((prev) => ({ ...prev, mention_notify_enabled: v }))
                  }
                />
                <ToggleRow
                  label="First-response SLA monitoring"
                  description="Background worker checks for breaches and records analytics events."
                  checked={automation.sla_enabled}
                  disabled={!canManage}
                  onChange={(v) => setAutomation((prev) => ({ ...prev, sla_enabled: v }))}
                />
                <ToggleRow
                  label="Email on SLA breach"
                  description="Notify assignee or routing fallback when a breach is detected (not only via workflow rules)."
                  checked={automation.sla_notify_enabled ?? true}
                  disabled={!canManage || !automation.sla_enabled}
                  onChange={(v) =>
                    setAutomation((prev) => ({ ...prev, sla_notify_enabled: v }))
                  }
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">First response SLA (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    value={automation.first_response_sla_minutes}
                    disabled={!canManage || !automation.sla_enabled}
                    onChange={(e) =>
                      setAutomation((prev) => ({
                        ...prev,
                        first_response_sla_minutes: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full max-w-[200px] rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white disabled:opacity-60"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Next response SLA (minutes)</span>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    When waiting_status is waiting_agent and the customer is not answered.
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    value={automation.next_response_sla_minutes ?? automation.first_response_sla_minutes}
                    disabled={!canManage || !automation.sla_enabled}
                    onChange={(e) =>
                      setAutomation((prev) => ({
                        ...prev,
                        next_response_sla_minutes: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full max-w-[200px] rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white disabled:opacity-60"
                  />
                </label>
              </div>
            </section>

            {canManage ? (
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#3ECF8E] px-4 py-2.5 text-sm font-semibold text-[#0b1020] transition hover:bg-[#35b87d] disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            ) : null}
          </form>
        )}
      </div>
    </main>
  )
}
