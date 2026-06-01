import { ChevronRight, LayoutGrid, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  InboxMemberPermissionsEditor,
  InboxMemberPermissionsToolbar,
} from '../components/settings/InboxMemberPermissionsEditor.jsx'
import { useAuthContext } from '../context/AuthContext.jsx'
import {
  deleteOrgMember,
  fetchOrgMember,
  fetchOrgTeammatePermissionRoles,
  patchOrgMemberPermissions,
} from '../services/orgWorkspaceApi.js'
import {
  CUSTOM_PERMISSION_ROLE_NAME,
  defaultInboxMemberPermissions,
  inboxMemberPermissionsEqual,
  isValidOrgPermissionRoleId,
  mergeInboxMemberPermissions,
  parsePermissionTemplateMeta,
  validateInboxMemberPermissionsForSave,
  withPermissionTemplateMeta,
} from '@ai-support/shared'

function displayNameFromMember(m) {
  const fn = typeof m?.firstName === 'string' ? m.firstName.trim() : ''
  const ln = typeof m?.lastName === 'string' ? m.lastName.trim() : ''
  const combined = `${fn} ${ln}`.trim()
  if (combined) return combined
  const email = typeof m?.email === 'string' ? m.email : ''
  if (email.includes('@')) return email.split('@')[0].replace(/[._]/g, ' ')
  return 'Teammate'
}

function permissionsFromMember(member) {
  const raw = member?.permissions
  if (raw && typeof raw === 'object') {
    return mergeInboxMemberPermissions(raw)
  }
  return withPermissionTemplateMeta(defaultInboxMemberPermissions(), {
    templateRoleId: null,
    templateRoleName: CUSTOM_PERMISSION_ROLE_NAME,
  })
}

export default function OrgEditTeammatePermissionsPage() {
  const { orgId, memberId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthContext()

  const teammatesPath = `/org/${orgId}/settings/teammates`

  const [member, setMember] = useState(location.state?.member ?? null)
  const [loading, setLoading] = useState(!location.state?.member)
  const [loadError, setLoadError] = useState('')
  const [permissions, setPermissions] = useState(() =>
    permissionsFromMember(location.state?.member),
  )
  const [orgRoles, setOrgRoles] = useState([])
  const [selectedTemplateRoleId, setSelectedTemplateRoleId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')

  const initialSnapshotRef = useRef('')

  const merged = useMemo(() => mergeInboxMemberPermissions(permissions), [permissions])
  const usingTemplate = Boolean(selectedTemplateRoleId)
  const selectedRole = orgRoles.find((r) => r.id === selectedTemplateRoleId) ?? null

  const isSelf = Boolean(user?.id && member?.userId === user.id)
  const displayName = member ? displayNameFromMember(member) : 'Teammate'

  const dirty = useMemo(() => {
    if (!initialSnapshotRef.current) return false
    return !inboxMemberPermissionsEqual(merged, JSON.parse(initialSnapshotRef.current))
  }, [merged])

  const applyMember = useCallback((m) => {
    setMember(m)
    const perms = permissionsFromMember(m)
    const meta = parsePermissionTemplateMeta(perms)
    const templateId =
      meta.templateRoleId && isValidOrgPermissionRoleId(meta.templateRoleId)
        ? meta.templateRoleId
        : ''
    setSelectedTemplateRoleId(templateId)
    setPermissions(perms)
    initialSnapshotRef.current = JSON.stringify(mergeInboxMemberPermissions(perms))
  }, [])

  const loadMember = useCallback(async () => {
    if (!orgId || !memberId) return
    setLoading(true)
    setLoadError('')
    try {
      const data = await fetchOrgMember(orgId, memberId)
      if (!data?.member) throw new Error('Teammate not found.')
      applyMember(data.member)
    } catch (e) {
      setLoadError(e?.message || 'Could not load teammate.')
      setMember(null)
    } finally {
      setLoading(false)
    }
  }, [orgId, memberId, applyMember])

  const loadOrgRoles = useCallback(async () => {
    try {
      const data = await fetchOrgTeammatePermissionRoles(orgId)
      setOrgRoles(Array.isArray(data?.roles) ? data.roles : [])
    } catch {
      setOrgRoles([])
    }
  }, [orgId])

  useEffect(() => {
    if (!member && memberId) void loadMember()
    else if (member && !initialSnapshotRef.current) {
      applyMember(member)
    }
  }, [member, memberId, loadMember, applyMember])

  useEffect(() => {
    void loadOrgRoles()
  }, [loadOrgRoles])

  if (!memberId) {
    return <Navigate to={teammatesPath} replace />
  }

  if (loading) {
    return (
      <main className="flex h-full items-center justify-center bg-[#0b1020] text-sm text-slate-500">
        Loading teammate…
      </main>
    )
  }

  if (loadError || !member) {
    return (
      <main className="h-full min-h-0 overflow-y-auto bg-[#0b1020] px-4 py-12 text-center text-slate-400">
        <p>{loadError || 'Teammate not found.'}</p>
        <Link to={teammatesPath} className="mt-4 inline-block text-sm text-[#3ECF8E] hover:underline">
          Back to teammates
        </Link>
      </main>
    )
  }

  function handlePermissionsChange(next) {
    const mergedNext = mergeInboxMemberPermissions(next)
    if (usingTemplate && selectedRole) {
      if (!inboxMemberPermissionsEqual(mergedNext, selectedRole.permissions)) {
        setSelectedTemplateRoleId('')
        setPermissions(
          withPermissionTemplateMeta(mergedNext, {
            templateRoleId: null,
            templateRoleName: CUSTOM_PERMISSION_ROLE_NAME,
          }),
        )
        return
      }
    }
    setPermissions(
      withPermissionTemplateMeta(mergedNext, {
        templateRoleId: selectedTemplateRoleId || null,
        templateRoleName: selectedRole?.name ?? CUSTOM_PERMISSION_ROLE_NAME,
      }),
    )
  }

  function handleTemplateRoleSelect(roleId) {
    setSelectedTemplateRoleId(roleId)
    if (!roleId) {
      setPermissions(
        withPermissionTemplateMeta(merged, {
          templateRoleId: null,
          templateRoleName: CUSTOM_PERMISSION_ROLE_NAME,
        }),
      )
      return
    }
    const role = orgRoles.find((r) => r.id === roleId)
    if (!role) return
    setPermissions(
      withPermissionTemplateMeta(role.permissions, {
        templateRoleId: role.id,
        templateRoleName: role.name,
      }),
    )
  }

  async function handleSave() {
    setError('')
    const payload = withPermissionTemplateMeta(merged, {
      templateRoleId: selectedTemplateRoleId || null,
      templateRoleName: selectedRole?.name ?? CUSTOM_PERMISSION_ROLE_NAME,
    })
    const check = validateInboxMemberPermissionsForSave(payload)
    if (!check.ok) {
      setError(check.error)
      return
    }

    setSubmitting(true)
    try {
      const data = await patchOrgMemberPermissions(orgId, memberId, { permissions: payload })
      if (data?.member) applyMember(data.member)
      navigate(teammatesPath, {
        replace: true,
        state: { inviteNotice: `Updated permissions for ${displayName}.` },
      })
    } catch (e) {
      setError(e?.message || 'Could not save changes.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove() {
    if (isSelf) return
    const ok = window.confirm(
      `Remove ${displayName} from this workspace? They will lose access immediately.`,
    )
    if (!ok) return

    setError('')
    setRemoving(true)
    try {
      await deleteOrgMember(orgId, memberId)
      navigate(teammatesPath, {
        replace: true,
        state: { inviteNotice: `${displayName} was removed from this workspace.` },
      })
    } catch (e) {
      setError(e?.message || 'Could not remove teammate.')
    } finally {
      setRemoving(false)
    }
  }

  const busy = submitting || removing

  return (
    <main className="flex h-full min-h-0 flex-col bg-[#0b1020] text-slate-100">
      <header className="shrink-0 border-b border-[#2b3858] px-4 py-4 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
              <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
              <Link to={teammatesPath} className="hover:text-[#3ECF8E]">
                All teammates
              </Link>
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              <span className="font-medium text-white">Change {displayName}&apos;s permissions</span>
            </nav>
            {member.email ? (
              <a
                href={`mailto:${member.email}`}
                className="mt-2 inline-block text-sm text-sky-400 hover:text-sky-300 hover:underline"
              >
                View their public profile
              </a>
            ) : (
              <span className="mt-2 inline-block text-sm text-slate-600">View their public profile</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(teammatesPath)}
              disabled={busy}
              className="rounded-lg border border-[#2b3858] bg-[#151b2e] px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={busy || isSelf}
              title={isSelf ? 'You cannot remove yourself' : undefined}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Remove teammate
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy || !dirty}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-slate-500"
            >
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
        {error ? (
          <p className="mx-auto mt-3 max-w-5xl text-sm text-rose-400 whitespace-pre-line">{error}</p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <label className="text-sm font-medium text-slate-300">Permission role</label>
            <select
              value={selectedTemplateRoleId}
              onChange={(e) => handleTemplateRoleSelect(e.target.value)}
              disabled={busy}
              className="mt-1 block w-full max-w-md rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              <option value="">{CUSTOM_PERMISSION_ROLE_NAME} (editable)</option>
              {orgRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            {usingTemplate ? (
              <p className="mt-2 text-xs text-slate-500">
                Permissions match the saved role &quot;{selectedRole?.name}&quot; and cannot be edited
                until you switch to {CUSTOM_PERMISSION_ROLE_NAME}.
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Custom permissions — adjust checkboxes below.
              </p>
            )}
          </div>

          <InboxMemberPermissionsToolbar
            permissions={merged}
            readOnly={usingTemplate}
            onChange={handlePermissionsChange}
          />

          <InboxMemberPermissionsEditor
            orgId={orgId}
            permissions={merged}
            readOnly={usingTemplate}
            onChange={handlePermissionsChange}
          />
        </div>
      </div>
    </main>
  )
}
