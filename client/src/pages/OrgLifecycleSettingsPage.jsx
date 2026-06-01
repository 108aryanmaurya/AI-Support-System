import { Clock, Loader2, Save } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { useWorkspaceCanManage } from '../hooks/useWorkspaceCanManage.js'
import {
  fetchOrgLifecycleSettings,
  patchOrgLifecycleSettings,
} from '../services/lifecycleSettingsApi.js'

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

function NumberField({ label, description, value, onChange, disabled, min = 1, max = 365 }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-400">
      <span className="font-medium text-white">{label}</span>
      {description ? <span className="text-xs text-slate-500">{description}</span> : null}
      <input
        type="number"
        min={min}
        max={max}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const parsed = Number(e.target.value)
          if (!Number.isFinite(parsed)) return
          onChange(parsed)
        }}
        className="mt-1 w-full max-w-[8rem] rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1.5 text-white outline-none focus:border-[#4f6290] disabled:opacity-40"
      />
    </label>
  )
}

export default function OrgLifecycleSettingsPage() {
  const { orgId } = useParams()
  const { organizations } = useOrganizationContext()
  const current = organizations.find((o) => o.orgId === orgId)
  const canManage = useWorkspaceCanManage(orgId)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [lifecycle, setLifecycle] = useState(null)

  const sanitizeLifecyclePayload = useCallback((raw) => {
    if (!raw || typeof raw !== 'object') return {}
    const out = {}
    const boolKeys = [
      'enabled',
      'reopen_on_customer_message',
      'set_waiting_customer_on_agent_reply',
      'set_waiting_agent_on_customer_reply',
      'customer_reminder_enabled',
    ]
    for (const key of boolKeys) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) {
        out[key] = Boolean(raw[key])
      }
    }
    const dayKeys = [
      'resolved_auto_close_days',
      'waiting_reminder_days',
      'waiting_auto_close_after_reminder_days',
      'new_conversation_after_closed_days',
    ]
    for (const key of dayKeys) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue
      const n = Number(raw[key])
      if (Number.isFinite(n) && n >= 1) out[key] = Math.round(n)
    }
    return out
  }, [])

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetchOrgLifecycleSettings(orgId)
      setLifecycle(res?.lifecycle ?? {})
    } catch (e) {
      setError(e.message || 'Failed to load lifecycle settings.')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const onSave = async () => {
    if (!orgId || !lifecycle || !canManage) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const payload = sanitizeLifecyclePayload(lifecycle)
      const res = await patchOrgLifecycleSettings(orgId, payload)
      setLifecycle(res?.lifecycle ?? lifecycle)
      setSaved(true)
      await load()
    } catch (e) {
      setError(e.message || 'Failed to save lifecycle settings.')
    } finally {
      setSaving(false)
    }
  }

  const disabled = !canManage || saving

  return (
    <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[#2b3858] bg-[#151b2e] text-slate-300">
              <Clock className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-semibold text-white">Conversation lifecycle</h1>
          </div>
          <Link
            to={`/org/${orgId}/settings`}
            className="text-sm text-slate-400 hover:text-white"
          >
            Settings home
          </Link>
        </div>

        <p className="mb-6 text-sm text-slate-400">
          Configure auto-close timers, customer reminders, and inbound reopen behavior. Requires the
          automation worker and{' '}
          <code className="rounded bg-[#0e1526] px-1 text-xs">POST /api/internal/cron/lifecycle-scan</code>{' '}
          every 15 minutes.
        </p>

        {!canManage ? (
          <p className="mb-4 rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            Only organization admins can edit lifecycle settings.
          </p>
        ) : null}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </p>
        ) : null}

        {error ? <p className="mb-4 text-sm text-red-300">{error}</p> : null}
        {saved ? <p className="mb-4 text-sm text-emerald-300">Settings saved.</p> : null}

        {lifecycle && !loading ? (
          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Master switch
              </h2>
              <ToggleRow
                label="Enable lifecycle automation"
                description="When off, cron scans no-op for this organization."
                checked={Boolean(lifecycle.enabled)}
                disabled={disabled}
                onChange={(v) => setLifecycle((s) => ({ ...s, enabled: v }))}
              />
            </section>

            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Timers (days)
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Resolved auto-close"
                  description="Resolved → closed after N days without activity."
                  value={lifecycle.resolved_auto_close_days ?? 14}
                  disabled={disabled}
                  onChange={(v) => setLifecycle((s) => ({ ...s, resolved_auto_close_days: v }))}
                />
                <NumberField
                  label="Waiting reminder (T1)"
                  description="Email reminder if customer is silent."
                  value={lifecycle.waiting_reminder_days ?? 3}
                  disabled={disabled}
                  max={90}
                  onChange={(v) => setLifecycle((s) => ({ ...s, waiting_reminder_days: v }))}
                />
                <NumberField
                  label="Close after reminder (T2)"
                  description="Close waiting conversations after reminder + silence."
                  value={lifecycle.waiting_auto_close_after_reminder_days ?? 7}
                  disabled={disabled}
                  max={90}
                  onChange={(v) =>
                    setLifecycle((s) => ({ ...s, waiting_auto_close_after_reminder_days: v }))
                  }
                />
                <NumberField
                  label="New conversation after closed"
                  description="Web: closed older than M days → new thread."
                  value={lifecycle.new_conversation_after_closed_days ?? 90}
                  disabled={disabled}
                  onChange={(v) =>
                    setLifecycle((s) => ({ ...s, new_conversation_after_closed_days: v }))
                  }
                />
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Behavior
              </h2>
              <ToggleRow
                label="Reopen on customer message"
                description="Email thread or recent web customer message reopens resolved/closed."
                checked={lifecycle.reopen_on_customer_message !== false}
                disabled={disabled}
                onChange={(v) => setLifecycle((s) => ({ ...s, reopen_on_customer_message: v }))}
              />
              <ToggleRow
                label="Waiting on customer after agent reply"
                description="Sets waiting_status to waiting_customer when an agent sends a reply (status stays open)."
                checked={lifecycle.set_waiting_customer_on_agent_reply !== false}
                disabled={disabled}
                onChange={(v) =>
                  setLifecycle((s) => ({ ...s, set_waiting_customer_on_agent_reply: v }))
                }
              />
              <ToggleRow
                label="Waiting on agent after customer reply"
                description="Sets waiting_status to waiting_agent when the customer sends a message (status stays open)."
                checked={lifecycle.set_waiting_agent_on_customer_reply !== false}
                disabled={disabled}
                onChange={(v) =>
                  setLifecycle((s) => ({ ...s, set_waiting_agent_on_customer_reply: v }))
                }
              />
              <ToggleRow
                label="Customer reminder emails"
                description="Requires verified outbound email (Settings → Email)."
                checked={lifecycle.customer_reminder_enabled !== false}
                disabled={disabled}
                onChange={(v) => setLifecycle((s) => ({ ...s, customer_reminder_enabled: v }))}
              />
            </section>

            {canManage ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => void onSave()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#3ECF8E] px-4 py-2 text-sm font-semibold text-[#0b1020] hover:bg-[#35b87d] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save lifecycle settings
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  )
}
