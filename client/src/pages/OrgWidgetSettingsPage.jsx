import { DEFAULT_WIDGET_SETTINGS } from '@ai-support/shared';
import { Loader2, MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ControlInboundVolumeSection from '../components/widget/ControlInboundVolumeSection.jsx';
import MessengerInstallSection from '../components/widget/MessengerInstallSection.jsx';
import { MessengerTabBar } from '../components/widget/MessengerSettingsUi.jsx';
import { useWorkspaceCanManage } from '../hooks/useWorkspaceCanManage.js';
import {
  createWidgetInstallation,
  fetchWidgetInstallations,
  fetchWidgetSnippet,
  patchWidgetInstallation,
  rotateWidgetSecret,
} from '../services/widgetApi.js';

const MESSENGER_TABS = [
  { id: 'widget', label: 'Widget', disabled: true },
  { id: 'spotlight', label: 'Spotlight', disabled: true },
  { id: 'mobile', label: 'Mobile SDKs', disabled: true },
  { id: 'conversations', label: 'Conversations', disabled: true },
  { id: 'general', label: 'General' },
  { id: 'install', label: 'Install' },
  { id: 'security', label: 'Security', disabled: true },
];

function mergeSettings(base, patch) {
  return { ...DEFAULT_WIDGET_SETTINGS, ...base, ...patch };
}

export default function OrgWidgetSettingsPage() {
  const { orgId } = useParams();
  const canManage = useWorkspaceCanManage(orgId);

  const [loading, setLoading] = useState(true);
  const [installations, setInstallations] = useState([]);
  const [activeInstallationId, setActiveInstallationId] = useState(null);
  const [settings, setSettings] = useState({ ...DEFAULT_WIDGET_SETTINGS });
  const [activeTab, setActiveTab] = useState('general');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadingSnippet, setLoadingSnippet] = useState(false);
  const [secretReveal, setSecretReveal] = useState(null);
  const [snippet, setSnippet] = useState('');
  const [domains, setDomains] = useState('localhost\n127.0.0.1');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWidgetInstallations(orgId);
      const list = data.installations ?? [];
      setInstallations(list);
      setActiveInstallationId((prev) => {
        if (list.length === 0) return null;
        if (prev && list.some((i) => i.id === prev)) return prev;
        return list[0].id;
      });
    } catch (e) {
      setError(e.message || 'Failed to load messenger settings');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const inst = installations.find((i) => i.id === activeInstallationId);
    if (inst) {
      setSettings(mergeSettings(inst.settings));
    }
  }, [activeInstallationId, installations]);

  async function persistSettings(nextSettings) {
    if (!canManage || !activeInstallationId) return;
    setSaving(true);
    setError('');
    try {
      const data = await patchWidgetInstallation(orgId, activeInstallationId, {
        settings: nextSettings,
      });
      setSettings(mergeSettings(data.installation?.settings));
      setInstallations((prev) =>
        prev.map((i) =>
          i.id === activeInstallationId ? { ...i, settings: data.installation?.settings } : i,
        ),
      );
    } catch (e) {
      setError(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function handleToggle(key, value) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    void persistSettings(next);
  }

  async function handleCreate() {
    if (!canManage) return;
    setCreating(true);
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
      });
      setSnippet(data.snippet ?? '');
      setActiveInstallationId(data.installation.id);
      setSettings(mergeSettings(data.installation.settings));
      const refreshed = await fetchWidgetInstallations(orgId);
      setInstallations(refreshed.installations ?? []);
      setActiveTab('install');
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function showSnippet(installationId) {
    setLoadingSnippet(true);
    setError('');
    try {
      const data = await fetchWidgetSnippet(orgId, installationId);
      setSnippet(data.snippet);
      setActiveInstallationId(installationId);
      setActiveTab('install');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingSnippet(false);
    }
  }

  async function handleRotateSecret(inst) {
    if (!canManage) return;
    setError('');
    try {
      const data = await rotateWidgetSecret(orgId, inst.id);
      setSecretReveal({
        widgetKey: inst.widget_key,
        secret: data.secret,
      });
      setActiveTab('install');
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
    <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400">
              <MessageSquare className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-white">Messenger</h1>
              <p className="text-sm text-slate-400">Web chat channel for your website</p>
            </div>
          </div>
          <Link
            to={`/org/${orgId}/settings`}
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Settings
          </Link>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</p>
        )}

        {!canManage && (
          <p className="mb-4 rounded-lg border border-[#2b3858] bg-[#12192c] px-4 py-2 text-sm text-slate-400">
            You have read-only access. Ask an admin to change messenger settings.
          </p>
        )}

        {installations.length > 1 && (
          <div className="mb-4">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Installation
            </label>
            <select
              className="mt-1 block w-full max-w-md rounded-lg border border-[#2b3858] bg-[#12192c] px-3 py-2 text-sm text-white"
              value={activeInstallationId ?? ''}
              onChange={(e) => setActiveInstallationId(e.target.value)}
            >
              {installations.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.widget_key}
                </option>
              ))}
            </select>
          </div>
        )}

        <MessengerTabBar tabs={MESSENGER_TABS} activeTab={activeTab} onChange={setActiveTab} />

        <div className="mt-6">
          {activeTab === 'general' && (
            <>
              {installations.length === 0 ? (
                <div className="rounded-xl border border-[#2b3858] bg-[#12192c] p-6 text-center">
                  <p className="text-sm text-slate-400">
                    Create an installation on the <strong className="text-white">Install</strong>{' '}
                    tab to configure inbound volume.
                  </p>
                  <button
                    type="button"
                    className="mt-4 text-sm font-medium text-[#ff7a59] hover:underline"
                    onClick={() => setActiveTab('install')}
                  >
                    Go to Install →
                  </button>
                </div>
              ) : (
                <ControlInboundVolumeSection
                  settings={settings}
                  onToggle={handleToggle}
                  saving={saving}
                  readOnly={!canManage}
                />
              )}
            </>
          )}

          {activeTab === 'install' && (
            <MessengerInstallSection
              installations={installations}
              canManage={canManage}
              snippet={snippet}
              secretReveal={secretReveal}
              domains={domains}
              onDomainsChange={setDomains}
              onCreate={handleCreate}
              onShowSnippet={showSnippet}
              onRotateSecret={handleRotateSecret}
              creating={creating}
              loadingSnippet={loadingSnippet}
            />
          )}

          {['widget', 'spotlight', 'mobile', 'conversations', 'security'].includes(activeTab) && (
            <div className="rounded-xl border border-[#2b3858] bg-[#12192c] p-8 text-center">
              <p className="text-sm text-slate-400">This section is coming soon.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
