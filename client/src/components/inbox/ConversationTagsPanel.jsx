import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchOrgTags, setConversationTags } from '../../services/tagsApi.js'
import { apiFetch } from '../../services/api.js'

export function ConversationTagsPanel({ organizationId, conversationId, onUpdated }) {
  const [allTags, setAllTags] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!organizationId || !conversationId) return
    setLoading(true)
    setError('')
    try {
      const [tagsRes, convRes] = await Promise.all([
        fetchOrgTags(organizationId),
        apiFetch(
          `/api/org/${encodeURIComponent(organizationId)}/tags/conversations/${encodeURIComponent(conversationId)}`,
        ),
      ])
      setAllTags(tagsRes.tags ?? [])
      setSelectedIds((convRes.tags ?? []).map((t) => t.id))
    } catch (e) {
      setError(e.message || 'Failed to load tags.')
    } finally {
      setLoading(false)
    }
  }, [organizationId, conversationId])

  useEffect(() => {
    load()
  }, [load])

  function toggleTag(tagId) {
    setSelectedIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  async function save() {
    if (!organizationId || !conversationId) return
    setSaving(true)
    setError('')
    try {
      const res = await setConversationTags(organizationId, conversationId, selectedIds)
      onUpdated?.(res.conversation)
    } catch (e) {
      setError(e.message || 'Failed to save tags.')
    } finally {
      setSaving(false)
    }
  }

  if (!conversationId) {
    return <p className="text-xs text-slate-500">Select a conversation to manage tags.</p>
  }

  if (loading) return <p className="text-xs text-slate-500">Loading tags…</p>

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tags</span>
      {allTags.length === 0 ? (
        <p className="text-xs text-slate-500">
          No tags defined.{' '}
          <Link
            to={`/org/${organizationId}/settings/tags`}
            className="text-[#3ECF8E] hover:underline"
          >
            Create tags in settings
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => {
            const on = selectedIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`rounded-full px-2 py-0.5 text-xs font-medium transition ${
                  on ? 'ring-1 ring-white/30' : 'opacity-70 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: `${tag.color}33`,
                  color: tag.color,
                  border: `1px solid ${tag.color}55`,
                }}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      )}
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="self-start rounded-md border border-[#334060] bg-[#0f1728] px-2 py-1 text-xs text-slate-300 hover:bg-[#1a2540] disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save tags'}
      </button>
    </div>
  )
}
