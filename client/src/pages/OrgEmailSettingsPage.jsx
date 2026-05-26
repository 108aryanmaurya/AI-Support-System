import { Check, Copy, Loader2, Mail, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import {
  deleteOrgEmailSettings,
  fetchOrgEmailSettings,
  patchOrgEmailAddresses,
  postOrgEmailDomainDns,
  postOrgEmailDomainVerify,
  postOrgEmailForwarding,
  postOrgEmailForwardingConfirm,
  postOrgEmailSendingDomain,
} from '../services/orgEmailSettingsApi.js'

function StatusBadge({ ok, label }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ok ? 'bg-emerald-950/80 text-emerald-300' : 'bg-amber-950/80 text-amber-300'
      }`}
    >
      {label}
    </span>
  )
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-lg border border-[#2b3858] p-1.5 text-slate-400 hover:bg-[#1a2238] hover:text-white"
      title="Copy"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </button>
  )
}

export default function OrgEmailSettingsPage() {
  const { orgId } = useParams()
  const { organizations } = useOrganizationContext()
  const current = organizations.find((o) => o.orgId === orgId)
  const isAdmin = String(current?.role ?? '').toUpperCase() === 'ADMIN'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(null)
  const [displaySupportEmail, setDisplaySupportEmail] = useState('')
  const [subdomainInput, setSubdomainInput] = useState('')
  const [outboundLocal, setOutboundLocal] = useState('support')
  const [busy, setBusy] = useState('')
  const [showAdvancedDns, setShowAdvancedDns] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchOrgEmailSettings(orgId)
      setSettings(data)
      if (data.displaySupportEmail) setDisplaySupportEmail(data.displaySupportEmail)
      if (data.subdomain) setSubdomainInput(data.subdomain)
      if (data.outboundLocalPart) setOutboundLocal(data.outboundLocalPart)
      if (data.setupMode === 'dns') setShowAdvancedDns(true)
    } catch (e) {
      setError(e.message || 'Failed to load email settings.')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  async function handleStartForwarding(e) {
    e.preventDefault()
    if (!isAdmin || !orgId) return
    setBusy('forwarding')
    setError('')
    try {
      const data = await postOrgEmailForwarding(orgId, displaySupportEmail.trim() || null)
      setSettings(data)
    } catch (e) {
      setError(e.message || 'Failed to set up forwarding.')
    } finally {
      setBusy('')
    }
  }

  async function handleConfirmForwarding() {
    if (!isAdmin || !orgId) return
    setBusy('forwardConfirm')
    setError('')
    try {
      const data = await postOrgEmailForwardingConfirm(orgId)
      setSettings(data)
    } catch (e) {
      setError(e.message || 'Failed to confirm forwarding.')
    } finally {
      setBusy('')
    }
  }

  async function handleStartSendingDomain(e) {
    e.preventDefault()
    if (!isAdmin || !orgId) return
    setBusy('sendingDomain')
    setError('')
    try {
      const data = await postOrgEmailSendingDomain(orgId, subdomainInput.trim())
      setSettings(data)
      if (data.outboundLocalPart) setOutboundLocal(data.outboundLocalPart)
    } catch (e) {
      setError(e.message || 'Failed to start sending domain setup.')
    } finally {
      setBusy('')
    }
  }

  async function handleStartDnsMode(e) {
    e.preventDefault()
    if (!isAdmin || !orgId) return
    setBusy('dnsMode')
    setError('')
    try {
      const data = await postOrgEmailDomainDns(orgId, subdomainInput.trim())
      setSettings(data)
      setShowAdvancedDns(true)
    } catch (e) {
      setError(e.message || 'Failed to start DNS setup.')
    } finally {
      setBusy('')
    }
  }

  async function handleVerify() {
    if (!isAdmin || !orgId) return
    setBusy('verify')
    setError('')
    try {
      const data = await postOrgEmailDomainVerify(orgId)
      setSettings(data)
      if (data.outboundLocalPart) setOutboundLocal(data.outboundLocalPart)
    } catch (e) {
      setError(e.message || 'DNS verification failed.')
    } finally {
      setBusy('')
    }
  }

  async function handleSaveAddresses(e) {
    e.preventDefault()
    if (!isAdmin || !orgId) return
    setBusy('addresses')
    setError('')
    try {
      const body = { displaySupportEmail: displaySupportEmail.trim() || null }
      if (settings?.subdomain) {
        body.outboundLocalPart = outboundLocal
      }
      const data = await patchOrgEmailAddresses(orgId, body)
      setSettings((prev) => ({ ...prev, ...data }))
    } catch (e) {
      setError(e.message || 'Failed to save addresses.')
    } finally {
      setBusy('')
    }
  }

  async function handleDisconnect() {
    if (!isAdmin || !orgId) return
    if (!window.confirm('Disconnect email for this workspace? The email channel will be deactivated.')) {
      return
    }
    setBusy('delete')
    setError('')
    try {
      await deleteOrgEmailSettings(orgId)
      setSettings(null)
      setDisplaySupportEmail('')
      setSubdomainInput('')
      setShowAdvancedDns(false)
      await load()
    } catch (e) {
      setError(e.message || 'Failed to disconnect.')
    } finally {
      setBusy('')
    }
  }

  const configured = settings?.configured
  const setupMode = settings?.setupMode ?? 'forwarding'
  const isDnsMode = setupMode === 'dns'
  const forwardAddress = settings?.inboundAddress ?? ''
  const subdomain = settings?.subdomain ?? ''
  const records = Array.isArray(settings?.dnsRecords) ? settings.dnsRecords : []
  const hasForwardAddress = Boolean(forwardAddress)
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 md:p-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Email channel</h1>
            <p className="mt-1 text-sm text-slate-400">
              Forward mail from your existing inbox, then verify DNS to send replies from your domain.
            </p>
          </div>
        </div>

        {!isAdmin ? (
          <p className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            Only workspace admins can configure email.
          </p>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="space-y-8">
            {/* Step 1: Forwarding */}
            <section className="rounded-2xl border border-[#2b3858] bg-[#0e1526] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">1. Receive — forward to us</h2>
                {configured ? (
                  <StatusBadge
                    ok={settings.forwardingReady}
                    label={settings.forwardingReady ? 'Forwarding active' : 'Confirm forwarding'}
                  />
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Keep using Google Workspace or Microsoft 365. Add a rule that forwards messages from your
                support address to the unique address below (Intercom-style). No MX changes on your domain.
              </p>

              <form onSubmit={handleStartForwarding} className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Your public support email (optional)</span>
                  <input
                    type="email"
                    value={displaySupportEmail}
                    onChange={(e) => setDisplaySupportEmail(e.target.value)}
                    placeholder="support@yourcompany.com"
                    disabled={!isAdmin || busy === 'forwarding'}
                    className="mt-1 w-full rounded-xl border border-[#2b3858] bg-[#12192c] px-3 py-2 text-sm text-white placeholder:text-slate-500 disabled:opacity-60"
                  />
                </label>
                {!hasForwardAddress ? (
                  <button
                    type="submit"
                    disabled={!isAdmin || busy === 'forwarding'}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#3ECF8E] px-4 py-2 text-sm font-semibold text-[#0b1020] disabled:opacity-50"
                  >
                    {busy === 'forwarding' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Generate forward address
                  </button>
                ) : null}
              </form>

              {hasForwardAddress ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 rounded-xl border border-[#2b3858] bg-[#12192c] px-3 py-2">
                    <code className="min-w-0 flex-1 truncate text-sm text-emerald-300">{forwardAddress}</code>
                    <CopyButton value={forwardAddress} />
                  </div>
                  <ul className="list-inside list-disc space-y-1 text-xs text-slate-400">
                    <li>
                      Gmail: Settings → Forwarding → Add forward address, or create a filter to forward to
                      this address.
                    </li>
                    <li>Microsoft 365: Mail flow rule or inbox rule → forward to this address.</li>
                    <li>After forwarding is live, send a test email and confirm below.</li>
                  </ul>
                  {!settings.forwardingReady ? (
                    <button
                      type="button"
                      onClick={handleConfirmForwarding}
                      disabled={!isAdmin || busy === 'forwardConfirm'}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#3ECF8E]/40 bg-[#3ECF8E]/10 px-4 py-2 text-sm font-medium text-[#3ECF8E] disabled:opacity-50"
                    >
                      {busy === 'forwardConfirm' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      I&apos;ve set up forwarding
                    </button>
                  ) : (
                    <p className="text-xs text-emerald-400/90">
                      Forwarding confirmed. Customer mail to your support address should appear in the inbox
                      after your provider forwards it here.
                    </p>
                  )}
                </div>
              ) : null}
            </section>

            {/* Step 2: Sending DNS */}
            {configured && !isDnsMode ? (
              <section className="rounded-2xl border border-[#2b3858] bg-[#0e1526] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">2. Send — verify your domain (DNS)</h2>
                  <StatusBadge
                    ok={settings.sendingReady}
                    label={settings.sendingReady ? 'Sending ready' : 'Sending pending'}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Add SPF and DKIM on a subdomain (e.g.{' '}
                  <code className="text-slate-300">support.yourcompany.com</code>) so agent replies send as
                  your brand. Inbound MX on this subdomain is not required when using forwarding above.
                </p>

                {!subdomain ? (
                  <form onSubmit={handleStartSendingDomain} className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={subdomainInput}
                      onChange={(e) => setSubdomainInput(e.target.value)}
                      placeholder="support.yourcompany.com"
                      disabled={!isAdmin || busy === 'sendingDomain'}
                      className="min-w-0 flex-1 rounded-xl border border-[#2b3858] bg-[#12192c] px-3 py-2 text-sm text-white placeholder:text-slate-500 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={!isAdmin || busy === 'sendingDomain'}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3ECF8E] px-4 py-2 text-sm font-semibold text-[#0b1020] disabled:opacity-50"
                    >
                      {busy === 'sendingDomain' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Add sending subdomain
                    </button>
                  </form>
                ) : (
                  <>
                    <p className="mt-3 font-mono text-sm text-slate-300">{subdomain}</p>
                    {records.length > 0 ? (
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-xs">
                          <thead>
                            <tr className="border-b border-[#2b3858] text-slate-500">
                              <th className="pb-2 pr-3 font-medium">Type</th>
                              <th className="pb-2 pr-3 font-medium">Name</th>
                              <th className="pb-2 pr-3 font-medium">Value</th>
                              <th className="pb-2 pr-3 font-medium">Priority</th>
                              <th className="pb-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {records.map((rec, idx) => (
                              <tr key={`${rec.name}-${rec.type}-${idx}`} className="border-b border-[#1d253a]">
                                <td className="py-2 pr-3 text-slate-300">{rec.type}</td>
                                <td className="py-2 pr-3">
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono text-slate-200">{rec.name || '@'}</span>
                                    <CopyButton value={rec.name} />
                                  </div>
                                </td>
                                <td className="max-w-[200px] py-2 pr-3">
                                  <div className="flex items-center gap-1">
                                    <span className="truncate font-mono text-slate-200" title={rec.value}>
                                      {rec.value}
                                    </span>
                                    <CopyButton value={rec.value} />
                                  </div>
                                </td>
                                <td className="py-2 pr-3 text-slate-400">{rec.priority ?? '—'}</td>
                                <td className="py-2 text-slate-400">{rec.status || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={!isAdmin || busy === 'verify'}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#3ECF8E]/40 bg-[#3ECF8E]/10 px-4 py-2 text-sm font-medium text-[#3ECF8E] disabled:opacity-50"
                    >
                      {busy === 'verify' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      I&apos;ve added DNS records — check verification
                    </button>
                  </>
                )}
              </section>
            ) : null}

            {/* Step 3: From address */}
            {configured && subdomain && settings.sendingReady ? (
              <section className="rounded-2xl border border-[#2b3858] bg-[#0e1526] p-5">
                <h2 className="text-sm font-semibold text-white">3. Reply-from address</h2>
                <p className="mt-1 text-xs text-slate-400">Agents send replies from this address.</p>
                <form onSubmit={handleSaveAddresses} className="mt-4 space-y-4">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-400">Sending (From)</span>
                    <div className="mt-1 flex items-center rounded-xl border border-[#2b3858] bg-[#12192c]">
                      <input
                        type="text"
                        value={outboundLocal}
                        onChange={(e) => setOutboundLocal(e.target.value)}
                        disabled={!isAdmin || busy === 'addresses'}
                        className="w-32 border-0 bg-transparent px-3 py-2 text-sm text-white focus:outline-none disabled:opacity-60"
                      />
                      <span className="text-sm text-slate-500">@{subdomain}</span>
                    </div>
                  </label>
                  <button
                    type="submit"
                    disabled={!isAdmin || busy === 'addresses'}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#3ECF8E] px-4 py-2 text-sm font-semibold text-[#0b1020] disabled:opacity-50"
                  >
                    {busy === 'addresses' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save
                  </button>
                </form>
              </section>
            ) : null}

            {/* Advanced: full DNS mode */}
            {isAdmin ? (
              <section className="rounded-2xl border border-dashed border-[#2b3858] bg-[#0a0f1a] p-5">
                <button
                  type="button"
                  onClick={() => setShowAdvancedDns((v) => !v)}
                  className="text-sm font-medium text-slate-300 hover:text-white"
                >
                  {showAdvancedDns ? '▼' : '▶'} Advanced: direct DNS (send + receive on subdomain)
                </button>
                {showAdvancedDns ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs text-slate-400">
                      Use this if you prefer MX on your subdomain instead of forwarding. Not recommended if
                      you already use Google Workspace on your root domain.
                    </p>
                    {isDnsMode && configured ? (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge ok={settings.sendingReady} label="Sending" />
                          <StatusBadge ok={settings.receivingReady} label="Receiving (MX)" />
                        </div>
                        {records.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] text-left text-xs">
                              <thead>
                                <tr className="border-b border-[#2b3858] text-slate-500">
                                  <th className="pb-2 pr-3 font-medium">Type</th>
                                  <th className="pb-2 pr-3 font-medium">Name</th>
                                  <th className="pb-2 pr-3 font-medium">Value</th>
                                  <th className="pb-2 font-medium">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {records.map((rec, idx) => (
                                  <tr key={`dns-${idx}`} className="border-b border-[#1d253a]">
                                    <td className="py-2 pr-3 text-slate-300">{rec.type}</td>
                                    <td className="py-2 pr-3 font-mono text-slate-200">{rec.name || '@'}</td>
                                    <td className="max-w-[240px] truncate py-2 pr-3 font-mono text-slate-200">
                                      {rec.value}
                                    </td>
                                    <td className="py-2 text-slate-400">{rec.status || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={handleVerify}
                          disabled={busy === 'verify'}
                          className="inline-flex items-center gap-2 text-sm text-[#3ECF8E]"
                        >
                          {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Check DNS
                        </button>
                      </>
                    ) : (
                      <form onSubmit={handleStartDnsMode} className="flex flex-col gap-3 sm:flex-row">
                        <input
                          type="text"
                          value={subdomainInput}
                          onChange={(e) => setSubdomainInput(e.target.value)}
                          placeholder="support.yourcompany.com"
                          className="min-w-0 flex-1 rounded-xl border border-[#2b3858] bg-[#12192c] px-3 py-2 text-sm text-white"
                        />
                        <button
                          type="submit"
                          disabled={busy === 'dnsMode'}
                          className="rounded-xl border border-[#2b3858] px-4 py-2 text-sm text-slate-200 hover:bg-[#12192c]"
                        >
                          {busy === 'dnsMode' ? '…' : 'Use DNS mode'}
                        </button>
                      </form>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}

            {configured && isAdmin ? (
              <section className="border-t border-[#1d253a] pt-6">
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={busy === 'delete'}
                  className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Disconnect email
                </button>
              </section>
            ) : null}
          </div>
        )}

        <p className="mt-8 text-xs text-slate-500">
          <Link to={`/org/${orgId}/settings`} className="text-[#3ECF8E] hover:underline">
            Back to settings
          </Link>
        </p>
      </div>
    </main>
  )
}
