import {
  Briefcase,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  Globe,
  Mail,
  MapPin,
  MessageSquareQuote,
  Pencil,
  Phone,
  User,
  UserCircle2,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TEAMMATE_BIO_MAX_LENGTH } from '@ai-support/shared'
import { useOrgPermissionsContext } from '../context/OrgPermissionsContext.jsx'
import {
  fetchTeammateProfile,
  patchTeammateProfile,
} from '../services/orgWorkspaceApi.js'

function displayNameFromMember(m) {
  const fn = typeof m?.firstName === 'string' ? m.firstName.trim() : ''
  const ln = typeof m?.lastName === 'string' ? m.lastName.trim() : ''
  const combined = `${fn} ${ln}`.trim()
  if (combined) return combined
  const email = typeof m?.email === 'string' ? m.email : ''
  if (email.includes('@')) return email.split('@')[0].replace(/[._]/g, ' ')
  return 'Teammate'
}

function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function formatRelative(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function formatLastActive(lastSeen, presenceStatus) {
  if (presenceStatus === 'online' || presenceStatus === 'available') {
    return 'Active now'
  }
  if (!lastSeen) return 'Inactive'
  const mins = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000)
  if (!Number.isFinite(mins) || mins < 0) return 'Inactive'
  if (mins < 15) return 'Active in the last 15 minutes'
  if (mins < 60) return `Active ${mins} minutes ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Active ${hrs} hours ago`
  const days = Math.floor(hrs / 24)
  return `Active ${days} days ago`
}

function formatLocalTime(timezone) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone || undefined,
    }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date())
  }
}

function workspaceAliasEmail(orgName, orgId, displayName) {
  const handle =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24) || 'teammate'
  const orgSlug =
    (orgName || 'workspace')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20) || 'workspace'
  const shortId = String(orgId || '').replace(/-/g, '').slice(0, 12)
  return `${handle}@${orgSlug}-${shortId}.workspace-mail.local`
}

function channelLabel(channelType) {
  const map = {
    email: 'Email',
    sms: 'Phone & SMS',
    phone: 'Phone & SMS',
    chat: 'Chat',
    messenger: 'Messenger',
  }
  return map[channelType] ?? channelType ?? 'Conversation'
}

function customerLabel(conv) {
  const meta = conv?.metadata
  if (meta && typeof meta === 'object') {
    const email = meta.customer_email ?? meta.customerEmail ?? meta.from_email
    if (typeof email === 'string' && email.trim()) return email.trim()
    const name = meta.customer_name ?? meta.customerName
    if (typeof name === 'string' && name.trim()) return name.trim()
  }
  if (typeof conv?.subject === 'string' && conv.subject.trim()) return conv.subject.trim()
  return 'Customer'
}

function ProfileRow({ icon: Icon, children, className = '' }) {
  return (
    <div className={`flex items-start gap-3 text-sm text-slate-300 ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function ProfileFieldInput({ icon: Icon, value, onChange, placeholder, type = 'text', multiline = false }) {
  const base =
    'w-full rounded-lg border border-[#2b3858] bg-[#0b1020] px-3 py-2.5 pl-10 text-sm text-white placeholder:text-slate-600 focus:border-[#3ECF8E]/50 focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/30'
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" aria-hidden />
      {multiline ? (
        <textarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={3}
          className={`${base} resize-y`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={base}
        />
      )}
    </div>
  )
}

export default function OrgTeammateProfilePage() {
  const { orgId, teammateId } = useParams()
  const { membershipId, can } = useOrgPermissionsContext()

  const [bundle, setBundle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [draft, setDraft] = useState({
    firstName: '',
    lastName: '',
    jobTitle: '',
    profile: {},
  })

  const load = useCallback(async () => {
    if (!orgId || !teammateId) return
    setLoading(true)
    setLoadError('')
    try {
      const data = await fetchTeammateProfile(orgId, teammateId)
      setBundle(data)
      const m = data?.member ?? {}
      setDraft({
        firstName: m.firstName ?? '',
        lastName: m.lastName ?? '',
        jobTitle: m.jobTitle ?? '',
        profile: { ...(data?.profile ?? {}) },
      })
    } catch (e) {
      setLoadError(e?.message || 'Failed to load profile.')
      setBundle(null)
    } finally {
      setLoading(false)
    }
  }, [orgId, teammateId])

  useEffect(() => {
    void load()
  }, [load])

  const member = bundle?.member
  const profile = bundle?.profile ?? {}
  const isSelf = Boolean(
    membershipId && teammateId && membershipId === teammateId,
  )
  const canEdit = isSelf || can('team.manage_members')
  const displayName = member ? displayNameFromMember(member) : 'Teammate'
  const orgName = bundle?.organizationName ?? 'Workspace'
  const aliasEmail = workspaceAliasEmail(orgName, orgId, displayName)
  const location = editing ? draft.profile.location ?? '' : profile.location ?? ''
  const localTime = formatLocalTime(profile.timezone)
  const conversationsTitle = isSelf ? 'Your conversations' : 'Their conversations'
  const pageTitle = isSelf ? 'Your profile' : displayName
  const teammatesPath = `/org/${orgId}/settings/teammates`
  const permissionsPath = `/org/${orgId}/settings/teammates/${teammateId}/permissions`

  const presenceLabel = useMemo(() => {
    const status = bundle?.presence?.status
    if (status === 'online' || status === 'available') return 'Active'
    if (status === 'away' || status === 'busy') return 'Away'
    return 'Active'
  }, [bundle?.presence?.status])

  const bioRemaining = TEAMMATE_BIO_MAX_LENGTH - (draft.profile.bio?.length ?? 0)

  async function handleSave() {
    if (!orgId || !teammateId) return
    setSaving(true)
    setSaveError('')
    try {
      const data = await patchTeammateProfile(orgId, teammateId, {
        firstName: draft.firstName,
        lastName: draft.lastName,
        jobTitle: draft.jobTitle,
        profile: draft.profile,
      })
      setBundle(data)
      setDraft({
        firstName: data?.member?.firstName ?? '',
        lastName: data?.member?.lastName ?? '',
        jobTitle: data?.member?.jobTitle ?? '',
        profile: { ...(data?.profile ?? {}) },
      })
      setEditing(false)
    } catch (e) {
      setSaveError(e?.message || 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  function updateProfileField(key, value) {
    setDraft((prev) => ({
      ...prev,
      profile: { ...prev.profile, [key]: value },
    }))
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
        Loading profile…
      </div>
    )
  }

  if (loadError || !member) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-red-400">{loadError || 'Profile not found.'}</p>
        <Link
          to={teammatesPath}
          className="mt-4 inline-block text-sm text-[#3ECF8E] hover:underline"
        >
          Back to teammates
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-full overflow-y-auto bg-[#080c14] text-slate-200">
      <div
        className="relative border-b border-[#1e2a44] bg-[#0c121f] px-6 pb-8 pt-6"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(46, 78, 120, 0.15), transparent), url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'800\' height=\'200\' viewBox=\'0 0 800 200\'%3E%3Cpath fill=\'%231a2744\' fill-opacity=\'0.35\' d=\'M0 120 Q200 80 400 100 T800 110 L800 200 L0 200 Z\'/%3E%3C/svg%3E")',
          backgroundSize: 'cover',
        }}
      >
        <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500">
          <Link to={teammatesPath} className="hover:text-slate-300">
            Teammates
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="text-slate-400">{pageTitle}</span>
        </nav>

        <div className="flex flex-wrap items-start gap-5">
          <div className="relative">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#2b3858] text-2xl font-semibold text-white">
              {initialsFromName(displayName)}
            </span>
            {editing ? (
              <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border border-[#2b3858] bg-[#0e1420] text-slate-400">
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-white">{displayName}</h1>
              <span className="rounded-md bg-[#2b3858] px-2 py-0.5 text-xs font-medium text-slate-300">
                {member.role === 'ADMIN' ? 'Admin' : 'Teammate'}
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-4 text-sm text-slate-400">
              {location ? (
                <li className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {location}
                </li>
              ) : null}
              <li className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {localTime}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" aria-hidden />
                {formatLastActive(bundle?.presence?.lastSeen, bundle?.presence?.status)}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          <section className="rounded-xl border border-[#2b3858] bg-[#0e1420]">
            <div className="flex items-center justify-between border-b border-[#2b3858] px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Public profile</h2>
              {canEdit && !editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-[#3d4f6f] px-3 py-1 text-xs font-medium text-white transition hover:bg-white/5"
                >
                  Edit
                </button>
              ) : null}
              {editing ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="rounded-md bg-[#3ECF8E] px-3 py-1 text-xs font-semibold text-[#0b1020] transition hover:bg-[#35b87d] disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Done'}
                </button>
              ) : null}
            </div>

            <div className="space-y-4 px-4 py-4">
              {saveError ? (
                <p className="text-xs text-red-400" role="alert">
                  {saveError}
                </p>
              ) : null}

              {editing ? (
                <>
                  <ProfileFieldInput
                    icon={User}
                    value={draft.firstName}
                    onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
                    placeholder="First name"
                  />
                  <ProfileFieldInput
                    icon={Mail}
                    value={member.email ?? ''}
                    onChange={() => {}}
                    placeholder="Email"
                  />
                  <p className="-mt-2 pl-10 text-xs text-slate-500">
                    Workspace alias: {aliasEmail}
                  </p>
                  <ProfileFieldInput
                    icon={MapPin}
                    value={draft.profile.location ?? ''}
                    onChange={(e) => updateProfileField('location', e.target.value)}
                    placeholder="Add your location"
                  />
                  <p className="pl-10 text-xs text-slate-500">
                    <Clock className="mr-1 inline h-3 w-3" aria-hidden />
                    {localTime}
                  </p>
                  <label className="flex items-center gap-2 pl-10 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.profile.hide_location_from_users)}
                      onChange={(e) =>
                        updateProfileField('hide_location_from_users', e.target.checked)
                      }
                      className="rounded border-[#2b3858]"
                    />
                    Hide location from users
                  </label>
                  <ProfileFieldInput
                    icon={UserCircle2}
                    value={draft.profile.alias ?? ''}
                    onChange={(e) => updateProfileField('alias', e.target.value)}
                    placeholder="Alias"
                  />
                  <label className="flex items-center gap-2 pl-10 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.profile.hide_identity_from_users)}
                      onChange={(e) =>
                        updateProfileField('hide_identity_from_users', e.target.checked)
                      }
                      className="rounded border-[#2b3858]"
                    />
                    Hide identity from users
                  </label>
                  <ProfileFieldInput
                    icon={Briefcase}
                    value={draft.jobTitle}
                    onChange={(e) => setDraft((d) => ({ ...d, jobTitle: e.target.value }))}
                    placeholder="Add your job title"
                  />
                  <ProfileFieldInput
                    icon={Building2}
                    value={draft.profile.department ?? ''}
                    onChange={(e) => updateProfileField('department', e.target.value)}
                    placeholder="Add your department"
                  />
                  <ProfileFieldInput
                    icon={Phone}
                    value={draft.profile.phone ?? ''}
                    onChange={(e) => updateProfileField('phone', e.target.value)}
                    placeholder="Add your phone number"
                  />
                  <ProfileFieldInput
                    icon={MessageSquareQuote}
                    value={draft.profile.bio ?? ''}
                    onChange={(e) => updateProfileField('bio', e.target.value)}
                    placeholder="Introduce yourself"
                    multiline
                  />
                  <p className="text-right text-xs text-slate-500">
                    {Math.max(0, bioRemaining)} characters remaining
                  </p>
                  <ProfileFieldInput
                    icon={Calendar}
                    value={draft.profile.calendar_url ?? ''}
                    onChange={(e) => updateProfileField('calendar_url', e.target.value)}
                    placeholder="Add a link to your calendar"
                  />
                  <label className="flex items-center gap-2 pl-10 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.profile.hide_calendar_from_users)}
                      onChange={(e) =>
                        updateProfileField('hide_calendar_from_users', e.target.checked)
                      }
                      className="rounded border-[#2b3858]"
                    />
                    Hide calendar from users
                  </label>
                </>
              ) : (
                <>
                  <ProfileRow icon={User}>{displayName}</ProfileRow>
                  <ProfileRow icon={Mail}>
                    <span className="block truncate">{member.email ?? '—'}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {aliasEmail}
                    </span>
                  </ProfileRow>
                  <ProfileRow icon={Globe}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      {presenceLabel}
                    </span>
                  </ProfileRow>
                  {location ? (
                    <ProfileRow icon={MapPin}>
                      {location}
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" aria-hidden />
                        {localTime}
                      </span>
                    </ProfileRow>
                  ) : (
                    <ProfileRow icon={MapPin}>
                      <span className="text-slate-500">No location yet</span>
                    </ProfileRow>
                  )}
                  <ProfileRow icon={UserCircle2}>
                    {profile.alias?.trim()
                      ? profile.alias
                      : profile.hide_identity_from_users
                        ? 'Alias hidden'
                        : 'Alias Off'}
                  </ProfileRow>
                  <ProfileRow icon={Briefcase}>
                    {member.jobTitle?.trim() || (
                      <span className="text-slate-500">No job title yet</span>
                    )}
                  </ProfileRow>
                  <ProfileRow icon={Building2}>
                    {profile.department?.trim() || (
                      <span className="text-slate-500">No department yet</span>
                    )}
                  </ProfileRow>
                  <ProfileRow icon={Phone}>
                    {profile.phone?.trim() || (
                      <span className="text-slate-500">No phone number yet</span>
                    )}
                  </ProfileRow>
                  <ProfileRow icon={MessageSquareQuote}>
                    {profile.bio?.trim() || (
                      <span className="text-slate-500">Introduce yourself</span>
                    )}
                  </ProfileRow>
                  <ProfileRow icon={Calendar}>
                    {profile.calendar_url?.trim() ? (
                      <a
                        href={profile.calendar_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#3ECF8E] hover:underline"
                      >
                        {profile.calendar_url}
                      </a>
                    ) : (
                      <span className="text-slate-500">Add a link to your calendar</span>
                    )}
                  </ProfileRow>
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#2b3858] bg-[#0e1420] px-4 py-4">
            <h2 className="text-sm font-semibold text-white">Account</h2>
            <div className="mt-3 space-y-3">
              <ProfileRow icon={Calendar}>
                created {formatRelative(member.userCreatedAt ?? member.joinedAt)}
              </ProfileRow>
              <ProfileRow icon={Mail}>
                email {member.email ?? '—'}
              </ProfileRow>
            </div>
            {canEdit && !isSelf ? (
              <Link
                to={permissionsPath}
                className="mt-4 inline-block text-xs text-[#3ECF8E] hover:underline"
              >
                Edit permissions
              </Link>
            ) : null}
          </section>

          <section className="rounded-xl border border-[#2b3858] bg-[#0e1420] px-4 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Team inboxes</h2>
              {can('team.manage_members') ? (
                <Link
                  to={`/org/${orgId}/settings/inboxes`}
                  className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-[#3ECF8E]"
                  aria-label="Manage team inboxes"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
            <div className="mt-3">
              {(bundle?.inboxes ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">
                  {displayName} is not a member of any team inboxes
                </p>
              ) : (
                <ul className="space-y-2">
                  {(bundle?.inboxes ?? []).map((inbox) => (
                    <li key={inbox.id} className="flex items-center gap-2 text-sm text-slate-300">
                      <Users className="h-4 w-4 text-slate-500" aria-hidden />
                      {inbox.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-white">{conversationsTitle}</h2>
          {(bundle?.conversations ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2b3858] bg-[#0e1420]/50 px-6 py-12 text-center text-sm text-slate-500">
              {isSelf
                ? 'No conversations assigned to you yet.'
                : `No conversations assigned to ${displayName} yet.`}
            </div>
          ) : (
            <ul className="space-y-3">
              {(bundle?.conversations ?? []).map((conv) => {
                const customer = customerLabel(conv)
                const channel = channelLabel(conv.channelType)
                const preview = conv.lastMessage?.body?.trim() || conv.subject || ''
                const assigneeLabel = isSelf ? 'you' : displayName
                return (
                  <li
                    key={conv.id}
                    className="rounded-xl border border-[#2b3858] bg-[#0e1420] p-4 transition hover:border-[#3d4f6f]"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2b3858] text-xs font-semibold text-slate-200">
                        {initialsFromName(displayName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-200">
                          Assigned conversation with{' '}
                          <span className="font-medium text-white">{customer}</span> to{' '}
                          {assigneeLabel}
                          <span className="ml-2 text-xs text-slate-500">
                            · {channel}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatRelative(conv.updatedAt)}
                        </p>
                        {preview ? (
                          <p className="mt-2 line-clamp-2 text-sm text-slate-400">{preview}</p>
                        ) : null}
                        <Link
                          to={`/org/${orgId}/inbox?conversation=${conv.id}`}
                          className="mt-2 inline-block text-xs text-[#3ECF8E] hover:underline"
                        >
                          Open conversation
                        </Link>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
