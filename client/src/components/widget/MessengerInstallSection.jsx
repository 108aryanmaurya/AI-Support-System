import { Check, Copy, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg border border-[#2b3858] p-1.5 text-slate-400 hover:text-white"
      title="Copy"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

export default function MessengerInstallSection({
  installations,
  canManage,
  snippet,
  secretReveal,
  domains,
  onDomainsChange,
  onCreate,
  onShowSnippet,
  onRotateSecret,
  creating = false,
  loadingSnippet = false,
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#2b3858] bg-[#12192c] p-5">
        <h2 className="text-base font-semibold text-white">Installation</h2>
        <p className="mt-1 text-sm text-slate-400">
          Add the messenger to your website. Test locally on{' '}
          <code className="text-slate-300">localhost:5180</code> (messenger-web/test-site).
        </p>

        {canManage && (
          <div className="mt-5 rounded-lg border border-[#1d253a] bg-[#0f1424] p-4">
            <h3 className="text-sm font-medium text-white">Create installation</h3>
            <label className="mt-3 block text-sm text-slate-400">Allowed domains (one per line)</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-[#2b3858] bg-[#1a2238] p-2 text-sm text-white"
              rows={3}
              value={domains}
              onChange={(e) => onDomainsChange(e.target.value)}
            />
            <button
              type="button"
              onClick={onCreate}
              disabled={creating}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#ff7a59] px-4 py-2 text-sm font-medium text-white hover:bg-[#ff6b47] disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create widget
            </button>
          </div>
        )}

        {secretReveal && (
          <div className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/30 p-4">
            <h3 className="font-medium text-amber-200">Save these values — shown once</h3>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              Widget key: <code className="text-amber-100">{secretReveal.widgetKey}</code>
              <CopyButton value={secretReveal.widgetKey} />
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 break-all text-sm">
              Secret: <code className="text-amber-100">{secretReveal.secret}</code>
              <CopyButton value={secretReveal.secret} />
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[#2b3858] bg-[#12192c] p-5">
        <h3 className="text-sm font-semibold text-white">Your installations</h3>
        {installations.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No widget yet. Create one above.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {installations.map((inst) => (
              <li
                key={inst.id}
                className="rounded-lg border border-[#1d253a] bg-[#0f1424] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="text-sm text-blue-300">{inst.widget_key}</code>
                  <span className="rounded-full bg-[#1a2238] px-2 py-0.5 text-xs text-slate-400">
                    {inst.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Domains: {(inst.allowed_domains || []).join(', ') || 'none'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[#2b3858] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1a2238]"
                    onClick={() => onShowSnippet(inst.id)}
                    disabled={loadingSnippet}
                  >
                    {loadingSnippet ? 'Loading…' : 'Show embed snippet'}
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-[#2b3858] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1a2238]"
                      onClick={() => onRotateSecret(inst)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Rotate secret
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {snippet && (
        <section className="rounded-xl border border-[#2b3858] bg-[#12192c] p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Embed snippet</h3>
            <CopyButton value={snippet} />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-slate-300">
            {snippet}
          </pre>
        </section>
      )}
    </div>
  );
}
