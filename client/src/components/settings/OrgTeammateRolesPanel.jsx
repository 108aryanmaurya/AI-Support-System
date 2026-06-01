import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  InboxMemberPermissionsEditor,
  mergeInboxMemberPermissions,
} from './InboxMemberPermissionsEditor.jsx'
import {
  createOrgTeammatePermissionRole,
  deleteOrgTeammatePermissionRole,
  fetchOrgTeammatePermissionRoles,
  updateOrgTeammatePermissionRole,
} from '../../services/orgWorkspaceApi.js'
import {
  defaultInboxMemberPermissions,
  MAX_ORG_PERMISSION_ROLE_DESCRIPTION_LENGTH,
  validateInboxMemberPermissionsForSave,
} from '@ai-support/shared'

/**
 * @param {object} props
 * @param {string} props.orgId
 * @param {boolean} props.canManage — workspace ADMIN
 */
export function OrgTeammateRolesPanel({ orgId, canManage }) {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** @type {null | 'create' | string} — null = no form; 'create' = new role; string = editing role id */
  const [activeForm, setActiveForm] = useState(null)
  const [roleName, setRoleName] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [permissions, setPermissions] = useState(() => defaultInboxMemberPermissions())
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')

  const isEditing = activeForm !== null && activeForm !== 'create'
  const isCreating = activeForm === 'create'
  const showForm = activeForm !== null

  const loadRoles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchOrgTeammatePermissionRoles(orgId)
      setRoles(Array.isArray(data?.roles) ? data.roles : [])
    } catch (e) {
      setError(e?.message || 'Could not load roles.')
      setRoles([])
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void loadRoles()
  }, [loadRoles])

  const merged = mergeInboxMemberPermissions(permissions)

  function resetForm() {
    setActiveForm(null)
    setRoleName('')
    setRoleDescription('')
    setPermissions(defaultInboxMemberPermissions())
    setSaving(false)
  }

  function startCreate() {
    setError('')
    setActiveForm('create')
    setRoleName('')
    setRoleDescription('')
    setPermissions(defaultInboxMemberPermissions())
  }

  function startEdit(role) {
    setError('')
    setActiveForm(role.id)
    setRoleName(role.name ?? '')
    setRoleDescription(role.description ?? '')
    setPermissions(mergeInboxMemberPermissions(role.permissions))
  }

  function validateForm() {
    const name = roleName.trim()
    const description = roleDescription.trim()
    if (!name) {
      setError('Enter a name for this role.')
      return null
    }
    if (!description) {
      setError('Enter a description explaining what teammates with this role can do.')
      return null
    }
    const mergedPermissions = mergeInboxMemberPermissions(permissions)
    const permissionsCheck = validateInboxMemberPermissionsForSave(mergedPermissions)
    if (!permissionsCheck.ok) {
      setError(permissionsCheck.error)
      return null
    }
    return { name, description, permissions: mergedPermissions }
  }

  async function handleSaveRole() {
    const payload = validateForm()
    if (!payload) return

    setError('')
    setSaving(true)
    try {
      if (isCreating) {
        await createOrgTeammatePermissionRole(orgId, payload)
      } else if (isEditing) {
        await updateOrgTeammatePermissionRole(orgId, activeForm, payload)
      }
      resetForm()
      await loadRoles()
    } catch (e) {
      setError(
        e?.message ||
          (isCreating ? 'Could not create role.' : 'Could not update role.'),
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRole(roleId) {
    if (!window.confirm('Delete this role? Invites already sent keep their saved permissions.')) {
      return
    }
    if (activeForm === roleId) resetForm()
    setDeletingId(roleId)
    setError('')
    try {
      await deleteOrgTeammatePermissionRole(orgId, roleId)
      await loadRoles()
    } catch (e) {
      setError(e?.message || 'Could not delete role.')
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">
            Create reusable permission templates for invites. Teammates with a custom checklist use
            the <span className="text-slate-300">Custom</span> role on the invite step.
          </p>
        </div>
        {canManage && !showForm ? (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
            Add role
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {showForm ? (
        <div className="rounded-xl border border-[#2b3858] bg-[#111827]/60 p-5">
          <h2 className="mb-6 text-base font-semibold text-white">
            {isCreating ? 'New role' : 'Edit role'}
          </h2>

          <div className="space-y-6">
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Name</span>
              <p className="mt-0.5 text-xs text-slate-500">The role&apos;s title.</p>
              <input
                type="text"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                maxLength={64}
                placeholder="e.g. Support agent"
                className="mt-2 block w-full max-w-md rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#3ECF8E]/40 focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/30"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-300">Description</span>
              <p className="mt-0.5 text-xs text-slate-500">
                A clear explanation of what the role allows teammates to do.
              </p>
              <textarea
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
                maxLength={MAX_ORG_PERMISSION_ROLE_DESCRIPTION_LENGTH}
                rows={3}
                placeholder="e.g. Can handle support conversations, manage shared macros, and view reports."
                className="mt-2 block w-full max-w-xl rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#3ECF8E]/40 focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]/30"
              />
            </label>

            <div>
              <span className="text-sm font-medium text-slate-300">Permissions</span>
              <p className="mt-0.5 text-xs text-slate-500">
                The set of permissions you want this role to include.
              </p>
              <div className="mt-3">
                <InboxMemberPermissionsEditor
                  orgId={orgId}
                  permissions={merged}
                  onChange={(next) => setPermissions(mergeInboxMemberPermissions(next))}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveRole()}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-50"
            >
              {saving ? 'Saving…' : isCreating ? 'Save role' : 'Save changes'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={resetForm}
              className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading roles…</p>
      ) : roles.length === 0 && !showForm ? (
        <p className="rounded-xl border border-[#2b3858] bg-[#111827]/50 px-6 py-12 text-center text-sm text-slate-500">
          {canManage
            ? 'No permission roles yet. Add a role to reuse it when inviting teammates.'
            : 'No permission roles have been created for this workspace.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#2b3858] bg-[#0e1420]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#2b3858] text-xs uppercase text-slate-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Description</th>
                {canManage ? <th className="px-4 py-3 font-medium text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const isActiveRow = activeForm === role.id
                return (
                  <tr
                    key={role.id}
                    className={`border-b border-[#2b3858]/80 ${
                      isActiveRow ? 'bg-[#151b2e]/60' : ''
                    }`}
                  >
                    <td className="px-4 py-3 align-top font-medium text-slate-200">{role.name}</td>
                    <td className="px-4 py-3 align-top text-slate-400">
                      {role.description?.trim() ? role.description : '—'}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3 align-top text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={saving || deletingId === role.id}
                            onClick={() => startEdit(role)}
                            className="inline-flex items-center gap-1 rounded-md border border-[#2b3858] px-2 py-1 text-xs text-slate-400 hover:border-[#3ECF8E]/35 hover:text-[#3ECF8E] disabled:opacity-40"
                            aria-label={`Edit ${role.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === role.id || saving}
                            onClick={() => void handleDeleteRole(role.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-[#2b3858] px-2 py-1 text-xs text-slate-400 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-40"
                            aria-label={`Delete ${role.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
