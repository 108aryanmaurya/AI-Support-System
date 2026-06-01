import { Check, Copy, LayoutGrid, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthContext } from '../context/AuthContext.jsx'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { useWorkspaceCanManage } from '../hooks/useWorkspaceCanManage.js'
import {
  fetchOrgGeneralSettings,
  patchOrgGeneralSettings,
  postOrgGeneralDeletionRequest,
} from '../services/generalSettingsApi.js'

const COMMON_TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]

function SettingsSection({ title, description, children }) {
  return (
    <section className="grid gap-6 border-b border-[#2b3858] py-8 md:grid-cols-[minmax(0,280px)_1fr] md:gap-10">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  )
}

function FieldLabel({ children }) {
  return <span className="mb-1.5 block text-sm font-medium text-slate-300">{children}</span>
}

function ToggleSwitch({ checked, onChange, disabled, label }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[#2b3858]/80 bg-[#0e1420]/60 px-4 py-3">
      <span className="text-sm text-slate-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-orange-500' : 'bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export default function OrgGeneralSettingsPage() {
  const { orgId } = useParams()
  const { user } = useAuthContext()
  const { refresh: refreshOrgs } = useOrganizationContext()
  const canManage = useWorkspaceCanManage(orgId)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toggleSaving, setToggleSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [name, setName] = useState('')
  const [appId, setAppId] = useState('')
  const [timezone, setTimezone] = useState('America/Los_Angeles')
  const [disableTeamMentions, setDisableTeamMentions] = useState(false)
  const [hideCsat, setHideCsat] = useState(false)
  const [deletionRequestedAt, setDeletionRequestedAt] = useState(null)

  const [initialName, setInitialName] = useState('')
  const [initialTimezone, setInitialTimezone] = useState('America/Los_Angeles')

  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [copiedAppId, setCopiedAppId] = useState(false)

  const expectedFullName = useMemo(() => {
    const fn = typeof user?.user_metadata?.first_name === 'string' ? user.user_metadata.first_name.trim() : ''
    const ln = typeof user?.user_metadata?.last_name === 'string' ? user.user_metadata.last_name.trim() : ''
    return `${fn} ${ln}`.trim()
  }, [user])

  const nameTimezoneDirty =
    name.trim() !== initialName.trim() || timezone !== initialTimezone

  const deleteNameMatches =
    deleteConfirmName.trim().length > 0 &&
    expectedFullName.length > 0 &&
    deleteConfirmName.trim().toLowerCase() === expectedFullName.toLowerCase()

  const timezoneOptions = useMemo(() => {
    const set = new Set(COMMON_TIMEZONES)
    if (timezone) set.add(timezone)
    return [...set]
  }, [timezone])

  const applyPayload = useCallback((data) => {
    const n = typeof data?.name === 'string' ? data.name : ''
    const tz = data?.general?.timezone ?? 'America/Los_Angeles'
    setName(n)
    setInitialName(n)
    setAppId(typeof data?.appId === 'string' ? data.appId : '')
    setTimezone(tz)
    setInitialTimezone(tz)
    setDisableTeamMentions(Boolean(data?.general?.disable_team_mentions_in_notes))
    setHideCsat(Boolean(data?.general?.hide_csat_scores_from_agents))
    setDeletionRequestedAt(data?.deletionRequestedAt ?? null)
  }, [])

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchOrgGeneralSettings(orgId)
      applyPayload(data)
    } catch (e) {
      setError(e?.message || 'Failed to load general settings.')
    } finally {
      setLoading(false)
    }
  }, [orgId, applyPayload])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSaveNameTimezone() {
    if (!orgId || !canManage || !nameTimezoneDirty) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const data = await patchOrgGeneralSettings(orgId, {
        name: name.trim(),
        timezone,
      })
      applyPayload(data)
      await refreshOrgs()
      setNotice('Workspace name and time zone saved.')
    } catch (e) {
      setError(e?.message || 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function persistToggle(patch) {
    if (!orgId || !canManage) return
    setToggleSaving(true)
    setError('')
    try {
      const data = await patchOrgGeneralSettings(orgId, patch)
      applyPayload(data)
    } catch (e) {
      setError(e?.message || 'Could not save setting.')
      void load()
    } finally {
      setToggleSaving(false)
    }
  }

  async function handleCopyAppId() {
    if (!appId) return
    try {
      await navigator.clipboard.writeText(appId)
      setCopiedAppId(true)
      setTimeout(() => setCopiedAppId(false), 2000)
    } catch {
      setError('Could not copy App ID.')
    }
  }

  async function handleConfirmDelete() {
    if (!orgId || !canManage || !deleteNameMatches || deletionRequestedAt) return
    setDeleting(true)
    setError('')
    setNotice('')
    try {
      const result = await postOrgGeneralDeletionRequest(orgId, deleteConfirmName.trim())
      setDeletionRequestedAt(result?.deletionRequestedAt ?? new Date().toISOString())
      setNotice(result?.message ?? 'Workspace deletion scheduled.')
      setDeleteConfirmName('')
    } catch (e) {
      setError(e?.message || 'Could not schedule deletion.')
    } finally {
      setDeleting(false)
    }
  }

  const inputClass =
    'w-full max-w-md rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white outline-none focus:border-[#3ECF8E]/40 focus:ring-1 focus:ring-[#3ECF8E]/30 disabled:opacity-50'

  if (loading) {
    return (
      <main className="flex h-full items-center justify-center bg-[#0b1020] text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    )
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-[#0b1020] text-slate-100">
      <div className="border-b border-[#2b3858] px-4 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 text-sm text-slate-500">
          <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
          <Link to={`/org/${orgId}/settings`} className="hover:text-[#3ECF8E]">
            Settings
          </Link>
          <span className="text-slate-600">/</span>
          <span className="font-medium text-white">General</span>
        </div>
        <h1 className="mx-auto mt-3 max-w-4xl text-xl font-semibold text-white">General</h1>
      </div>

      <div className="mx-auto max-w-4xl px-4 sm:px-8 lg:px-10">
        {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}
        {notice ? <p className="mt-4 text-sm text-[#7ee8b5]">{notice}</p> : null}
        {toggleSaving ? (
          <p className="mt-2 text-xs text-slate-500">Saving preference…</p>
        ) : null}

        <SettingsSection
          title="Workspace name & time zone"
          description="The workspace time zone will affect time-dependent features across ResolveAI."
        >
          <label className="block max-w-md">
            <FieldLabel>Name</FieldLabel>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage || saving}
              className={inputClass}
            />
          </label>

          <div className="block max-w-md">
            <FieldLabel>App ID</FieldLabel>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={appId}
                className={`${inputClass} flex-1 font-mono text-slate-400`}
              />
              <button
                type="button"
                onClick={() => void handleCopyAppId()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#2b3858] bg-[#151b2e] px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-[#3ECF8E]/35"
              >
                {copiedAppId ? (
                  <>
                    <Check className="h-4 w-4 text-[#3ECF8E]" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <label className="block max-w-md">
            <FieldLabel>Time zone</FieldLabel>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!canManage || saving}
              className={inputClass}
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>

          {canManage ? (
            <button
              type="button"
              onClick={() => void handleSaveNameTimezone()}
              disabled={saving || !nameTimezoneDirty || !name.trim()}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-slate-500"
            >
              {saving ? 'Saving…' : 'Save name & time zone'}
            </button>
          ) : null}
        </SettingsSection>

        <SettingsSection
          title="Delete workspace"
          description="You can delete this workspace by entering your full name and confirming the deletion. The workspace will be deleted within 14 days of confirmation."
        >
          {deletionRequestedAt ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Deletion scheduled on{' '}
              {new Date(deletionRequestedAt).toLocaleString()}. This workspace will be removed
              within 14 days.
            </p>
          ) : (
            <div className="flex max-w-lg flex-col gap-3 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1">
                <FieldLabel>Enter your full name</FieldLabel>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  disabled={!canManage || deleting}
                  placeholder={expectedFullName || 'First Last'}
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={!canManage || deleting || !deleteNameMatches}
                className="shrink-0 rounded-lg border border-rose-500/40 bg-rose-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting ? 'Confirming…' : 'Confirm delete'}
              </button>
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          title="Team mentions"
          description="Control whether teammates can @mention teams in notes and internal ticket conversations."
        >
          <ToggleSwitch
            label="Disable team mentions in notes"
            checked={disableTeamMentions}
            disabled={!canManage || toggleSaving}
            onChange={(next) => {
              setDisableTeamMentions(next)
              void persistToggle({ disable_team_mentions_in_notes: next })
            }}
          />
        </SettingsSection>

        <SettingsSection
          title="CSAT score visibility"
          description="Control whether agents can see CSAT scores in the conversation inbox."
        >
          <ToggleSwitch
            label="Hide CSAT scores from agents"
            checked={hideCsat}
            disabled={!canManage || toggleSaving}
            onChange={(next) => {
              setHideCsat(next)
              void persistToggle({ hide_csat_scores_from_agents: next })
            }}
          />
        </SettingsSection>

        <p className="py-8 text-center text-sm text-slate-600">
          <Link to={`/org/${orgId}/settings`} className="text-[#3ECF8E] hover:underline">
            ← Back to settings home
          </Link>
        </p>
      </div>
    </main>
  )
}
