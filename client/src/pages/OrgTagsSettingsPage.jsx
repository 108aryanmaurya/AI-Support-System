import { Loader2, Plus, Save, Tag, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import {
  createOrgTag,
  deleteOrgTag,
  fetchOrgTags,
  patchOrgTag,
} from '../services/tagsApi.js'

const DEFAULT_COLOR = '#64748b'

function TagPreview({ name, color }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: `${color}33`,
        color,
        border: `1px solid ${color}55`,
      }}
    >
      {name || 'Preview'}
    </span>
  )
}

export default function OrgTagsSettingsPage() {
  const { orgId } = useParams()
  const { organizations } = useOrganizationContext()
  const current = organizations.find((o) => o.orgId === orgId)
  const isAdmin = String(current?.role ?? '').toUpperCase() === 'ADMIN'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tags, setTags] = useState([])

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(DEFAULT_COLOR)
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(DEFAULT_COLOR)
  const [savingId, setSavingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const loadTags = useCallback(async () => {
    if (!orgId) return
    setError('')
    setLoading(true)
    try {
      const res = await fetchOrgTags(orgId)
      setTags(res?.tags ?? [])
    } catch (e) {
      setError(e.message || 'Failed to load tags.')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  async function handleCreate(e) {
    e.preventDefault()
    if (!isAdmin || !orgId) return
    const name = newName.trim()
    if (!name) {
      setError('Tag name is required.')
      return
    }
    setCreating(true)
    setError('')
    try {
      const res = await createOrgTag(orgId, { name, color: newColor })
      if (res?.tag) {
        setTags((prev) => [...prev, res.tag].sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        await loadTags()
      }
      setNewName('')
      setNewColor(DEFAULT_COLOR)
    } catch (err) {
      setError(err.message || 'Failed to create tag.')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(tag) {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color || DEFAULT_COLOR)
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditColor(DEFAULT_COLOR)
  }

  async function handleSaveEdit(tagId) {
    if (!isAdmin || !orgId) return
    const name = editName.trim()
    if (!name) {
      setError('Tag name is required.')
      return
    }
    setSavingId(tagId)
    setError('')
    try {
      const res = await patchOrgTag(orgId, tagId, { name, color: editColor })
      const updated = res?.tag
      setTags((prev) =>
        prev
          .map((t) => (t.id === tagId ? updated ?? { ...t, name, color: editColor } : t))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      cancelEdit()
    } catch (err) {
      setError(err.message || 'Failed to update tag.')
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(tag) {
    if (!isAdmin || !orgId) return
    const ok = window.confirm(
      `Delete tag "${tag.name}"? It will be removed from all conversations that use it.`,
    )
    if (!ok) return
    setDeletingId(tag.id)
    setError('')
    try {
      await deleteOrgTag(orgId, tag.id)
      setTags((prev) => prev.filter((t) => t.id !== tag.id))
      if (editingId === tag.id) cancelEdit()
    } catch (err) {
      setError(err.message || 'Failed to delete tag.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700/80 text-white">
            <Tag className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-white">Conversation tags</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              Define tags agents can apply in the inbox. AI auto-tagging only applies names that match
              these definitions.
            </p>
          </div>
          <Link
            to={`/org/${orgId}/settings`}
            className="text-sm text-[#3ECF8E] hover:underline"
          >
            ← Settings home
          </Link>
        </div>

        {!isAdmin ? (
          <p className="mb-4 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
            Only workspace admins can create, edit, or delete tags. You can view the list below.
          </p>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {isAdmin ? (
          <form
            onSubmit={handleCreate}
            className="mb-8 rounded-xl border border-[#2b3858] bg-[#12192c] p-4"
          >
            <h2 className="text-sm font-medium text-white">Create tag</h2>
            <p className="mt-1 text-xs text-slate-400">Names are unique per workspace (max 64 characters).</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className="mb-1 block text-xs text-slate-400">Name</span>
                <input
                  type="text"
                  maxLength={64}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. billing, urgent"
                  className="w-full rounded-lg border border-[#2b3858] bg-[#0e1526] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[#3ECF8E]/50 focus:outline-none"
                />
              </label>
              <label className="sm:w-28">
                <span className="mb-1 block text-xs text-slate-400">Color</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded border border-[#2b3858] bg-[#0e1526] p-0.5"
                  />
                  <input
                    type="text"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    className="min-w-0 flex-1 rounded-lg border border-[#2b3858] bg-[#0e1526] px-2 py-2 text-xs text-white focus:border-[#3ECF8E]/50 focus:outline-none"
                  />
                </div>
              </label>
              <div className="flex items-center gap-3 sm:pb-0.5">
                <TagPreview name={newName.trim() || 'Preview'} color={newColor} />
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#3ECF8E] px-4 py-2 text-sm font-medium text-[#0b1020] transition hover:bg-[#35b87d] disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create
                </button>
              </div>
            </div>
          </form>
        ) : null}

        <section className="rounded-xl border border-[#2b3858] bg-[#12192c]">
          <h2 className="border-b border-[#2b3858] px-4 py-3 text-sm font-medium text-white">
            Tags ({tags.length})
          </h2>
          {loading ? (
            <p className="px-4 py-6 text-sm text-slate-400">Loading tags…</p>
          ) : tags.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">
              No tags yet.
              {isAdmin ? ' Create one above to use them in the inbox and for AI auto-tagging.' : ''}
            </p>
          ) : (
            <ul className="divide-y divide-[#2b3858]">
              {tags.map((tag) => {
                const isEditing = editingId === tag.id
                return (
                  <li key={tag.id} className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                          <label className="flex-1">
                            <span className="mb-1 block text-xs text-slate-400">Name</span>
                            <input
                              type="text"
                              maxLength={64}
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full rounded-lg border border-[#2b3858] bg-[#0e1526] px-3 py-2 text-sm text-white focus:border-[#3ECF8E]/50 focus:outline-none"
                            />
                          </label>
                          <label className="sm:w-28">
                            <span className="mb-1 block text-xs text-slate-400">Color</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={editColor}
                                onChange={(e) => setEditColor(e.target.value)}
                                className="h-10 w-12 cursor-pointer rounded border border-[#2b3858] bg-[#0e1526] p-0.5"
                              />
                              <input
                                type="text"
                                value={editColor}
                                onChange={(e) => setEditColor(e.target.value)}
                                className="min-w-0 flex-1 rounded-lg border border-[#2b3858] bg-[#0e1526] px-2 py-2 text-xs text-white focus:border-[#3ECF8E]/50 focus:outline-none"
                              />
                            </div>
                          </label>
                          <TagPreview name={editName.trim()} color={editColor} />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(tag.id)}
                            disabled={savingId === tag.id || !editName.trim()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#3ECF8E] px-3 py-1.5 text-sm font-medium text-[#0b1020] disabled:opacity-50"
                          >
                            {savingId === tag.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg border border-[#2b3858] px-3 py-1.5 text-sm text-slate-300 hover:bg-[#151b2e]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <TagPreview name={tag.name} color={tag.color || DEFAULT_COLOR} />
                        {isAdmin ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(tag)}
                              className="rounded-lg border border-[#2b3858] px-3 py-1.5 text-sm text-slate-300 hover:bg-[#151b2e]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(tag)}
                              disabled={deletingId === tag.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/50 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950/30 disabled:opacity-50"
                            >
                              {deletingId === tag.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
