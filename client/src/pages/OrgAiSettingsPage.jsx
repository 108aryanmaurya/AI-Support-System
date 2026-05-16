import { Bot, Save } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
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
  const isAdmin = String(current?.role ?? '').toUpperCase() === 'ADMIN'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [ai, setAi] = useState(null)
  const [automation, setAutomation] = useState(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchOrgAiSettings(orgId)
      setAi(data.ai ?? {})
      setAutomation(data.automation ?? {})
    } catch (e) {
      setError(e.message || 'Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave(e) {
    e.preventDefault()
    if (!isAdmin || !ai || !automation) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const data = await patchOrgAiSettings(orgId, { ai, automation })
      setAi(data.ai)
      setAutomation(data.automation)
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

        {!isAdmin ? (
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
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                AI capabilities
              </h2>
              <div className="space-y-2">
                <ToggleRow
                  label="Enable AI for this workspace"
                  description="Master switch. When off, AI assignment and per-conversation AI are blocked."
                  checked={ai.ai_enabled}
                  disabled={!isAdmin}
                  onChange={(v) => setAi((prev) => ({ ...prev, ai_enabled: v }))}
                />
                <ToggleRow
                  label="AI assist (Copilot)"
                  description="Suggest replies, summarize threads, and rewrite tone in the inbox."
                  phase="Phase 3"
                  checked={ai.assist_enabled}
                  disabled={!isAdmin || masterOff}
                  onChange={(v) => setAi((prev) => ({ ...prev, assist_enabled: v }))}
                />
                <ToggleRow
                  label="Auto-tag conversations"
                  description="Classify intent and sentiment into conversation metadata after inbound messages."
                  phase="Phase 3–4"
                  checked={ai.auto_tag_enabled}
                  disabled={!isAdmin || masterOff}
                  onChange={(v) => setAi((prev) => ({ ...prev, auto_tag_enabled: v }))}
                />
                <ToggleRow
                  label="Auto-route to AI queue"
                  description="Assign unassigned conversations to the AI queue when rules match."
                  phase="Phase 4"
                  checked={ai.auto_route_to_ai}
                  disabled={!isAdmin || masterOff}
                  onChange={(v) => setAi((prev) => ({ ...prev, auto_route_to_ai: v }))}
                />
                <ToggleRow
                  label="Autonomous customer replies"
                  description="Allow AI to send customer-visible messages with approval guardrails."
                  phase="Phase 6"
                  checked={ai.autonomous_replies_enabled}
                  disabled={!isAdmin || masterOff}
                  onChange={(v) => setAi((prev) => ({ ...prev, autonomous_replies_enabled: v }))}
                />
                <ToggleRow
                  label="AI enabled on new conversations"
                  description="Default for conversations.ai_enabled when a thread is created."
                  checked={ai.default_conversation_ai_enabled}
                  disabled={!isAdmin || masterOff}
                  onChange={(v) =>
                    setAi((prev) => ({ ...prev, default_conversation_ai_enabled: v }))
                  }
                />
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-400">Model tier (future)</span>
                <select
                  value={ai.model_tier}
                  disabled={!isAdmin || masterOff}
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
                Automation &amp; notifications
              </h2>
              <div className="space-y-2">
                <ToggleRow
                  label="Email on new customer message"
                  description="Notify assignee or admin when a customer sends a message."
                  checked={automation.inbound_notify_enabled}
                  disabled={!isAdmin}
                  onChange={(v) =>
                    setAutomation((prev) => ({ ...prev, inbound_notify_enabled: v }))
                  }
                />
                <ToggleRow
                  label="Email on assignment"
                  description="Notify the teammate when a conversation is assigned to them."
                  checked={automation.assignment_notify_enabled}
                  disabled={!isAdmin}
                  onChange={(v) =>
                    setAutomation((prev) => ({ ...prev, assignment_notify_enabled: v }))
                  }
                />
                <ToggleRow
                  label="First-response SLA monitoring"
                  description="Background worker checks for breaches and records analytics events."
                  checked={automation.sla_enabled}
                  disabled={!isAdmin}
                  onChange={(v) => setAutomation((prev) => ({ ...prev, sla_enabled: v }))}
                />
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-400">First response SLA (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={10080}
                  value={automation.first_response_sla_minutes}
                  disabled={!isAdmin || !automation.sla_enabled}
                  onChange={(e) =>
                    setAutomation((prev) => ({
                      ...prev,
                      first_response_sla_minutes: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full max-w-[200px] rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white disabled:opacity-60"
                />
              </label>
            </section>

            {isAdmin ? (
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
