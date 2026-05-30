import { useCallback, useState } from 'react'
import { primaryMentionHandle } from '@ai-support/shared'

/**
 * @param {object} opts
 * @param {string} opts.value — textarea value
 * @param {(value: string) => void} opts.onChange
 * @param {import('react').RefObject<HTMLTextAreaElement | null>} opts.textareaRef
 * @param {boolean} opts.enabled
 */
export function useComposerMentions({ value, onChange, textareaRef, enabled }) {
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionHighlight, setMentionHighlight] = useState(0)

  const updateMentionState = useCallback(
    (text, cursorPos) => {
      if (!enabled) {
        setMentionMenuOpen(false)
        return
      }
      const before = text.slice(0, cursorPos)
      const atMatch = before.match(/@([\w.-]*)$/)
      if (atMatch) {
        setMentionMenuOpen(true)
        setMentionQuery(atMatch[1] ?? '')
        setMentionHighlight(0)
      } else {
        setMentionMenuOpen(false)
        setMentionQuery('')
      }
    },
    [enabled],
  )

  const handleChange = useCallback(
    (next) => {
      onChange(next)
      const el = textareaRef.current
      const pos = el?.selectionStart ?? next.length
      updateMentionState(next, pos)
    },
    [onChange, textareaRef, updateMentionState],
  )

  const handleSelect = useCallback(
    (member) => {
      const el = textareaRef.current
      const text = value
      const cursor = el?.selectionStart ?? text.length
      const before = text.slice(0, cursor)
      const after = text.slice(cursor)
      const atMatch = before.match(/@([\w.-]*)$/)
      if (!atMatch) return

      const handle = primaryMentionHandle(member)
      const prefix = before.slice(0, before.length - atMatch[0].length)
      const next = `${prefix}@${handle} ${after}`
      onChange(next)
      setMentionMenuOpen(false)
      setMentionQuery('')
      requestAnimationFrame(() => {
        const pos = prefix.length + handle.length + 2
        el?.focus()
        el?.setSelectionRange(pos, pos)
      })
    },
    [onChange, textareaRef, value],
  )

  const handleKeyDown = useCallback(
    (event, filteredCount) => {
      if (!mentionMenuOpen || filteredCount === 0) return false

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMentionHighlight((i) => (i + 1) % filteredCount)
        return true
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionHighlight((i) => (i - 1 + filteredCount) % filteredCount)
        return true
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionMenuOpen(false)
        return true
      }
      return false
    },
    [mentionMenuOpen],
  )

  const closeMentionMenu = useCallback(() => {
    setMentionMenuOpen(false)
  }, [])

  return {
    mentionMenuOpen,
    mentionQuery,
    mentionHighlight,
    handleChange,
    handleSelect,
    handleKeyDown,
    closeMentionMenu,
    updateMentionState,
  }
}
