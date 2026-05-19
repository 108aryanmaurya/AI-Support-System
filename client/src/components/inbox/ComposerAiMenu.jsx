import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Languages, Sparkles, Wand2 } from 'lucide-react'
import { COMPOSER_REWRITE_TONES } from '@ai-support/shared'

const TRANSLATE_LANGUAGES = Object.freeze([
  'English',
  'Spanish',
  'French',
  'German',
  'Hindi',
  'Portuguese',
])

/**
 * @param {object} props
 * @param {boolean} props.disabled
 * @param {string | null} props.disabledReason
 * @param {(targetLanguage: string) => void} props.onTranslate
 * @param {(tone: string) => void} props.onRewrite
 */
export function ComposerAiMenu({ disabled, disabledReason, onTranslate, onRewrite }) {
  const [open, setOpen] = useState(false)
  const [submenu, setSubmenu] = useState(null)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
        setSubmenu(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function closeAll() {
    setOpen(false)
    setSubmenu(null)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        title={disabledReason ?? 'AI actions'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((v) => !v)
          setSubmenu(null)
        }}
        className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-950/30 px-2 py-1 text-[11px] font-medium text-violet-100 hover:bg-violet-950/50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Sparkles size={12} aria-hidden />
        AI
        <ChevronDown size={12} aria-hidden className={open ? 'rotate-180' : ''} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-1 min-w-[180px] rounded-md border border-[#334060] bg-[#10182a] py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-[#1a2338]"
            onClick={() => setSubmenu(submenu === 'translate' ? null : 'translate')}
          >
            <Languages size={14} aria-hidden className="text-sky-300" />
            Translate
            <ChevronDown
              size={12}
              aria-hidden
              className={`ml-auto ${submenu === 'translate' ? 'rotate-180' : ''}`}
            />
          </button>
          {submenu === 'translate' ? (
            <div className="border-t border-[#27314a] py-1">
              {TRANSLATE_LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-1.5 text-left text-xs text-slate-300 hover:bg-[#1a2338] hover:text-white"
                  onClick={() => {
                    onTranslate(lang)
                    closeAll()
                  }}
                >
                  {lang}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-[#1a2338]"
            onClick={() => setSubmenu(submenu === 'rewrite' ? null : 'rewrite')}
          >
            <Wand2 size={14} aria-hidden className="text-violet-300" />
            Rewrite tone
            <ChevronDown
              size={12}
              aria-hidden
              className={`ml-auto ${submenu === 'rewrite' ? 'rotate-180' : ''}`}
            />
          </button>
          {submenu === 'rewrite' ? (
            <div className="border-t border-[#27314a] py-1">
              {COMPOSER_REWRITE_TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-1.5 text-left text-xs capitalize text-slate-300 hover:bg-[#1a2338] hover:text-white"
                  onClick={() => {
                    onRewrite(tone)
                    closeAll()
                  }}
                >
                  {tone}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
