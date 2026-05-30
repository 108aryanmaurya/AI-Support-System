import { useEffect, useMemo, useRef } from 'react'
import { primaryMentionHandle } from '@ai-support/shared'

/**
 * @typedef {{ userId: string, displayName?: string | null, email?: string | null }} MentionMember
 */

/**
 * @param {object} props
 * @param {MentionMember[]} props.members
 * @param {string} props.query — text after @ (lowercase)
 * @param {boolean} props.open
 * @param {(member: MentionMember) => void} props.onSelect
 * @param {number} [props.highlightIndex]
 */
export function ComposerMentionMenu({ members, query, open, onSelect, highlightIndex = 0 }) {
  const listRef = useRef(null)

  const filtered = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase()
    const list = members ?? []
    if (!q) return list.slice(0, 12)
    return list
      .filter((m) => {
        const handle = primaryMentionHandle(m)
        const name = (m.displayName ?? '').toLowerCase()
        const email = (m.email ?? '').toLowerCase()
        return handle.includes(q) || name.includes(q) || email.includes(q)
      })
      .slice(0, 12)
  }, [members, query])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector('[data-mention-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, highlightIndex, filtered])

  if (!open || filtered.length === 0) return null

  return (
    <ul
      ref={listRef}
      role="listbox"
      className="absolute bottom-full left-0 z-30 mb-1 max-h-48 w-full min-w-[220px] overflow-y-auto rounded-md border border-[#334060] bg-[#10182a] py-1 shadow-lg [scrollbar-gutter:stable]"
    >
      {filtered.map((member, index) => {
        const handle = primaryMentionHandle(member)
        const isActive = index === highlightIndex
        return (
          <li key={member.userId} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={isActive}
              data-mention-active={isActive ? 'true' : undefined}
              className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[#1a2540] ${
                isActive ? 'bg-[#1a2540]' : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(member)
              }}
            >
              <span className="font-medium text-white">
                @{handle}
                {member.displayName ? (
                  <span className="ml-1 font-normal text-slate-400">{member.displayName}</span>
                ) : null}
              </span>
              {member.email ? (
                <span className="text-xs text-slate-500">{member.email}</span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
