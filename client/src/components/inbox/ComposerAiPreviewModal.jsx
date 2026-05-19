import { Loader2 } from 'lucide-react'

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {string} props.original
 * @param {string} props.proposed
 * @param {boolean} props.loading
 * @param {() => void} props.onReplace
 * @param {() => void} props.onCancel
 */
export function ComposerAiPreviewModal({
  open,
  title,
  original,
  proposed,
  loading,
  onReplace,
  onCancel,
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-ai-preview-title"
      onClick={onCancel}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-[#334060] bg-[#141b2d] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#27314a] px-4 py-3">
          <h2 id="composer-ai-preview-title" className="text-sm font-semibold text-white">
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Review the result before replacing your draft. Nothing changes until you confirm.
          </p>
        </div>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto px-4 py-3 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Original</p>
            <p className="mt-1 whitespace-pre-wrap rounded-md border border-[#334060] bg-[#0f1728] p-2 text-slate-300">
              {original || '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Proposed</p>
            {loading ? (
              <p className="mt-2 flex items-center gap-2 text-slate-400">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Generating…
              </p>
            ) : (
              <p className="mt-1 whitespace-pre-wrap rounded-md border border-violet-500/30 bg-violet-950/20 p-2 text-slate-100">
                {proposed || '—'}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#27314a] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-[#334060] px-3 py-1.5 text-xs text-slate-200 hover:bg-[#1a2338] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onReplace}
            disabled={loading || !proposed?.trim()}
            className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Replace in composer
          </button>
        </div>
      </div>
    </div>
  )
}
