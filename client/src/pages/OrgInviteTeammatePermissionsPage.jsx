import { ChevronRight, LayoutGrid } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  InboxMemberPermissionsEditor,
  InboxMemberPermissionsToolbar,
  mergeInboxMemberPermissions,
} from '../components/settings/InboxMemberPermissionsEditor.jsx'
import { useOrgPermissionsContext } from '../context/OrgPermissionsContext.jsx'
import { fetchOrgInboxes } from '../services/inboxesApi.js'
import {
  fetchOrgTeammatePermissionRoles,
  postOrgInvitesBatch,
} from '../services/orgWorkspaceApi.js'
import {
  clearInviteDraft,
  describeInviteInboxTargets,
  loadInviteDraft,
  normalizeInviteDraftInboxIds,
  saveInviteDraft,
} from '../utils/inviteDraftStorage.js'
import {
  CUSTOM_PERMISSION_ROLE_NAME,
  defaultInboxMemberPermissions,
  inboxMemberPermissionsEqual,
  validateInboxMemberPermissionsForSave,
  withPermissionTemplateMeta,
} from '@ai-support/shared'

function resolveDraft(orgId, locationState) {
  const fromState = locationState
  if (Array.isArray(fromState?.emails) && fromState.emails.length > 0) {
    return {
      emails: fromState.emails,
      inboxIds: normalizeInviteDraftInboxIds(fromState.inboxIds ?? fromState.inboxId),
    }
  }
  return loadInviteDraft(orgId)
}

function initialInvitePermissions() {
  return withPermissionTemplateMeta(defaultInboxMemberPermissions(), {
    templateRoleId: null,
    templateRoleName: CUSTOM_PERMISSION_ROLE_NAME,
  })
}

export default function OrgInviteTeammatePermissionsPage() {
  const { orgId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { can, loading: permissionsLoading } = useOrgPermissionsContext()

  const draft = useMemo(
    () => resolveDraft(orgId, location.state),
    [orgId, location.state],
  )
  const emails = draft?.emails ?? []
  const inboxIds = draft?.inboxIds ?? []

  const [permissions, setPermissions] = useState(initialInvitePermissions)
  const [orgRoles, setOrgRoles] = useState([])
  const [selectedTemplateRoleId, setSelectedTemplateRoleId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canInvite = can('team.invite')
  const merged = useMemo(() => mergeInboxMemberPermissions(permissions), [permissions])
  const usingTemplate = Boolean(selectedTemplateRoleId)
  const selectedRole = orgRoles.find((r) => r.id === selectedTemplateRoleId) ?? null

  const loadOrgRoles = useCallback(async () => {
    try {
      const data = await fetchOrgTeammatePermissionRoles(orgId)
      setOrgRoles(Array.isArray(data?.roles) ? data.roles : [])
    } catch {
      setOrgRoles([])
    }
  }, [orgId])

  useEffect(() => {
    void loadOrgRoles()
  }, [loadOrgRoles])

  if (permissionsLoading) {
    return (
      <main className="flex h-full items-center justify-center bg-[#0b1020] px-4 py-12 text-sm text-slate-500">
        Loading permissions…
      </main>
    )
  }

  if (emails.length === 0) {
    return <Navigate to={`/org/${orgId}/settings/teammates/invite/new`} replace />
  }

  const inviteBase = `/org/${orgId}/settings/teammates/invite/new`
  const backState = { emails, inboxIds }

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

  async function handleSendInvites() {
    setError('')

    const payloadPermissions = withPermissionTemplateMeta(merged, {
      templateRoleId: selectedTemplateRoleId || null,
      templateRoleName: selectedRole?.name ?? CUSTOM_PERMISSION_ROLE_NAME,
    })

    const permissionsCheck = validateInboxMemberPermissionsForSave(payloadPermissions)
    if (!permissionsCheck.ok) {
      setError(permissionsCheck.error)
      return
    }

    setSubmitting(true)
    saveInviteDraft(orgId, { emails, inboxIds })

    try {
      const roleLabel =
        typeof payloadPermissions.templateRoleName === 'string' &&
        payloadPermissions.templateRoleName.trim()
          ? payloadPermissions.templateRoleName.trim()
          : 'member'
      const data = await postOrgInvitesBatch(orgId, {
        emails,
        role: roleLabel,
        inboxIds,
        permissions: payloadPermissions,
      })
      const created = Array.isArray(data?.created) ? data.created : []
      const errs = Array.isArray(data?.errors) ? data.errors : []

      if (created.length === 0) {
        setError(
          errs.length > 0
            ? errs.map((x) => `${x.email}: ${x.error}`).join('\n')
            : 'No invites were created. Check that emails are valid and not already invited.',
        )
        return
      }

      clearInviteDraft(orgId)

      let inboxLabel = 'selected team inboxes'
      try {
        const inboxRes = await fetchOrgInboxes(orgId)
        const list = (inboxRes?.inboxes ?? []).filter((ib) => ib.status === 'active')
        inboxLabel = describeInviteInboxTargets(inboxIds, list)
      } catch {
        /* best-effort */
      }

      const acceptHint =
        inboxIds.length === 0
          ? 'They will join this workspace when they accept.'
          : `They join ${inboxLabel} on accept.`
      const notice =
        errs.length > 0
          ? `Invited ${created.length} teammate(s). ${acceptHint} Skipped: ${errs.map((x) => x.email).join(', ')}`
          : `Invited ${created.length} teammate(s). ${acceptHint}`

      navigate(`/org/${orgId}/settings/teammates`, {
        replace: true,
        state: { inviteNotice: notice },
      })
    } catch (e) {
      const msg = e?.message || 'Could not send invites.'
      setError(
        e?.status === 403
          ? `${msg} You need the “Invite teammates” permission for this workspace.`
          : msg,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-[#0b1020] px-4 py-6 text-slate-100 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm text-slate-500">
              <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
              <Link to={`/org/${orgId}/settings/teammates`} className="hover:text-[#3ECF8E]">
                All teammates
              </Link>
              <ChevronRight className="h-4 w-4" aria-hidden />
              <Link to={inviteBase} state={backState} className="hover:text-[#3ECF8E]">
                Invite teammates
              </Link>
              <ChevronRight className="h-4 w-4" aria-hidden />
              <span className="font-medium text-slate-300">Permissions and roles</span>
            </nav>
            <h1 className="text-2xl font-semibold text-white">Permissions and roles</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-500">
              Set permissions for {emails.length} teammate{emails.length === 1 ? '' : 's'}. Leave
              permission role unset to customize checkboxes, or pick a saved role template. The same
              permissions apply to each inbox they join on accept.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate(inviteBase, { state: backState })}
                className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:bg-white/5"
                disabled={submitting}
              >
                Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSendInvites()}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-50"
              >
                {submitting ? 'Sending invites…' : 'Send invites'}
              </button>
            </div>
            {error ? (
              <p className="max-w-sm text-right text-sm text-rose-400 whitespace-pre-line">{error}</p>
            ) : null}
          </div>
        </header>

        <div className="mb-6">
          <label className="text-sm font-medium text-slate-300">Permission role</label>
          <select
            value={selectedTemplateRoleId}
            onChange={(e) => handleTemplateRoleSelect(e.target.value)}
            className="mt-1 block w-full max-w-md rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white"
          >
            <option value="">No role selected</option>
            {orgRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          
          
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
    </main>
  )
}
