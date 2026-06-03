import { Check, Copy, Loader2, MessageCircle, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkspaceCanManage } from '../hooks/useWorkspaceCanManage.js';
import {
  createWidgetInstallation,
  fetchWidgetInstallations,
  fetchWidgetSnippet,
  patchWidgetInstallation,
  rotateWidgetSecret,
} from '../services/widgetApi.js';

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
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

export default function OrgWidgetSettingsPage() {
  const { orgId } = useParams();
  const canManage = useWorkspaceCanManage(orgId);
  const [loading, setLoading] = useState(true);
  const [installations, setInstallations] = useState([]);
  const [error, setError] = useState('');
  const [secretReveal, setSecretReveal] = useState(null);
  const [snippet, setSnippet] = useState('');
  const [domains, setDomains] = useState('localhost\n127.0.0.1');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWidgetInstallations(orgId);
      setInstallations(data.installations ?? []);
    } catch (e) {
      setError(e.message || 'Failed to load widget settings');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setError('');
    try {
      const domainList = domains
        .split(/[\n,]/)
        .map((d) => d.trim())
        .filter(Boolean);
      const data = await createWidgetInstallation(orgId, {
        allowedDomains: domainList.length ? domainList : ['localhost'],
        testMode: true,
        settings: { requireEmail: true, identifyAllowInsecure: true },
      });
      setSecretReveal({
        widgetKey: data.installation.widget_key,
        secret: data.secret,
        snippet: data.snippet,
      });
      setSnippet(data.snippet);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function showSnippet(installationId) {
    try {
      const data = await fetchWidgetSnippet(orgId, installationId);
      setSnippet(data.snippet);
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 text-slate-200">
      <div className="flex items-center gap-3">
        <MessageCircle className="h-8 w-8 text-blue-400" />
        <div>
          <h1 className="text-2xl font-semibold text-white">Web messenger widget</h1>
          <p className="text-sm text-slate-400">
            Embed chat on your site. Test on <code className="text-slate-300">localhost:5180</code>{' '}
            (messenger-web/test-site).
          </p>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</p>}

      {canManage && (
        <section className="rounded-xl border border-[#2b3858] bg-[#0f1424] p-5">
          <h2 className="mb-3 font-medium text-white">Create installation</h2>
          <label className="block text-sm text-slate-400">Allowed domains (one per line)</label>
          <textarea
            className="mt-1 w-full rounded-lg border border-[#2b3858] bg-[#1a2238] p-2 text-sm"
            rows={3}
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
          />
          <button
            type="button"
            onClick={handleCreate}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Create widget
          </button>
        </section>
      )}

      {secretReveal && (
        <section className="rounded-xl border border-amber-800/50 bg-amber-950/30 p-5">
          <h2 className="font-medium text-amber-200">Save these values — shown once</h2>
          <p className="mt-2 text-sm">
            Widget key: <code>{secretReveal.widgetKey}</code>
            <CopyButton value={secretReveal.widgetKey} />
          </p>
          <p className="mt-2 break-all text-sm">
            Secret: <code>{secretReveal.secret}</code>
            <CopyButton value={secretReveal.secret} />
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-black/40 p-3 text-xs">{snippet}</pre>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-medium text-white">Installations</h2>
        {installations.length === 0 && (
          <p className="text-sm text-slate-400">No widget yet. Create one above.</p>
        )}
        {installations.map((inst) => (
          <div key={inst.id} className="rounded-xl border border-[#2b3858] bg-[#0f1424] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="text-sm text-blue-300">{inst.widget_key}</code>
              <span className="text-xs text-slate-500">{inst.status}</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Domains: {(inst.allowed_domains || []).join(', ') || 'none'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-[#2b3858] px-3 py-1 text-xs hover:bg-[#1a2238]"
                onClick={() => showSnippet(inst.id)}
              >
                Show snippet
              </button>
              {canManage && (
                <button
                  type="button"
                  className="rounded-lg border border-[#2b3858] px-3 py-1 text-xs hover:bg-[#1a2238]"
                  onClick={async () => {
                    const data = await rotateWidgetSecret(orgId, inst.id);
                    setSecretReveal({
                      widgetKey: inst.widget_key,
                      secret: data.secret,
                      snippet: null,
                    });
                  }}
                >
                  Rotate secret
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      {snippet && (
        <section className="rounded-xl border border-[#2b3858] bg-[#0f1424] p-4">
          <h3 className="mb-2 text-sm font-medium">Embed snippet</h3>
          <pre className="overflow-x-auto rounded bg-black/40 p-3 text-xs">{snippet}</pre>
          <CopyButton value={snippet} />
        </section>
      )}
    </div>
  );
}
