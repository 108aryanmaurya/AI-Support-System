import { ChevronDown, Inbox } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * Customer-facing inbox queue selector (persists via parent URL `?inbox=`).
 *
 * @param {object} props
 * @param {Array<{ id: string, name: string }>} props.inboxes
 * @param {string} props.activeInboxId
 * @param {(inboxId: string) => void} props.onSelectInbox
 * @param {boolean} [props.loading]
 */
export function InboxSwitcher({ inboxes = [], activeInboxId, onSelectInbox, loading = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const active = inboxes.find((i) => i.id === activeInboxId) ?? inboxes[0]
  const label = active?.name ?? (loading ? 'Loading…' : 'Inbox')

  useEffect(() => {
    function onDoc(e) {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (!loading && inboxes.length === 0) {
    return (
      <span className="text-sm text-slate-400" title="No inboxes available">
        No inbox access
      </span>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg border border-[#3a4b6f] bg-[#18233b] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1f2d4a]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Inbox size={16} className="text-slate-300" aria-hidden />
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown size={14} className="text-slate-400" aria-hidden />
      </button>
      {open ? (
        <ul
          className="absolute left-0 z-50 mt-1 min-w-[200px] rounded-lg border border-[#3a4b6f] bg-[#101729] py-1 shadow-lg"
          role="listbox"
        >
          {inboxes.map((inbox) => (
            <li key={inbox.id}>
              <button
                type="button"
                role="option"
                aria-selected={inbox.id === activeInboxId}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#1a2338] ${
                  inbox.id === activeInboxId ? 'text-white font-medium' : 'text-slate-300'
                }`}
                onClick={() => {
                  onSelectInbox(inbox.id)
                  setOpen(false)
                }}
              >
                {inbox.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
