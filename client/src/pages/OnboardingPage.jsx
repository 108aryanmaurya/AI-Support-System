import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo.jsx'
import { Stepper } from '../components/onboarding/Stepper.jsx'
import { apiFetch } from '../services/api.js'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import { setLastOrgId } from '../utils/lastOrgStorage.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const COMPANY_SIZE_OPTIONS = ['1-9', '10-30', '31-50', '50+']

const USE_CASE_OPTIONS = [
  'Customer Support',
  'Technical Support',
  'Sales Queries',
  'Internal Support',
]

const CREATE_STEP_LABELS = ['Workspace', 'Team size', 'Use case', 'Invites']

/**
 * Accepts full invite URL (`?token=` or path segment) or a bare UUID token.
 */
export function extractInviteToken(input) {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return null

  try {
    const url = new URL(raw)
    const q = url.searchParams.get('token')
    if (q?.trim()) return q.trim()
    const parts = url.pathname.split('/').filter(Boolean)
    const last = parts[parts.length - 1]
    if (last && UUID_RE.test(last)) return last
  } catch {
    /* relative or opaque string */
  }

  const queryMatch = raw.match(/[?&]token=([^&]+)/i)
  if (queryMatch?.[1]) {
    try {
      return decodeURIComponent(queryMatch[1].trim())
    } catch {
      return queryMatch[1].trim()
    }
  }

  if (UUID_RE.test(raw)) return raw

  return null
}

function parseInviteEmails(raw) {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { refresh } = useOrganizationContext()

  const [panel, setPanel] = useState('choose')
  const [createStep, setCreateStep] = useState(1)

  const [orgName, setOrgName] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [useCase, setUseCase] = useState('')
  const [teamEmails, setTeamEmails] = useState('')

  const [inviteInput, setInviteInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const parsedInviteEmails = useMemo(() => parseInviteEmails(teamEmails), [teamEmails])

  function resetCreateFlow() {
    setCreateStep(1)
    setOrgName('')
    setCompanySize('')
    setUseCase('')
    setTeamEmails('')
    setError('')
  }

  function backToChoose() {
    setPanel('choose')
    resetCreateFlow()
  }

  async function finishCreateWorkspace(emails) {
    setError('')
    setSubmitting(true)
    try {
      const data = await apiFetch('/api/org/create', {
        method: 'POST',
        body: JSON.stringify({
          name: orgName.trim(),
          companySize: companySize.trim(),
          useCase: useCase.trim() || undefined,
        }),
      })
      const id = data?.organization?.id
      if (!id) throw new Error('Could not create organization.')

      for (const email of emails) {
        await apiFetch(`/api/org/${id}/invite`, {
          method: 'POST',
          body: JSON.stringify({ email, role: 'AGENT' }),
        })
      }

      await refresh()
      setLastOrgId(id)
      navigate(`/org/${id}/inbox`, { replace: true })
    } catch (e) {
      setError(e?.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  function validateAndAdvanceCreate() {
    if (createStep === 1) {
      if (!orgName.trim()) {
        setError('Enter an organization name.')
        return
      }
    }
    if (createStep === 2) {
      if (!companySize) {
        setError('Select a company size.')
        return
      }
    }
    setError('')
    setCreateStep((s) => Math.min(s + 1, 4))
  }

  function handleCreateBack() {
    setError('')
    if (createStep <= 1) {
      backToChoose()
      return
    }
    setCreateStep((s) => s - 1)
  }

  function handleFinishInvites() {
    const emails = parsedInviteEmails
    if (emails.length > 0) {
      const invalid = emails.find((email) => !EMAIL_REGEX.test(email))
      if (invalid) {
        setError(`Invalid email: ${invalid}`)
        return
      }
    }
    finishCreateWorkspace(emails)
  }

  function handleJoinContinue(event) {
    event.preventDefault()
    const token = extractInviteToken(inviteInput)
    if (!token) {
      setError('Paste a valid invite link or token.')
      return
    }
    setError('')
    navigate(`/invite?token=${encodeURIComponent(token)}`, { replace: false })
  }

  const inputClass =
    'w-full rounded-lg border border-[#2b3858] bg-[#151b2e] px-3 py-2.5 text-sm text-white outline-none ring-[#3ECF8E]/40 placeholder:text-slate-600 focus:border-[#3ECF8E]/50 focus:ring-2'

  return (
    <main className="min-h-screen bg-[#0b1020] px-4 py-12 text-slate-100">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-10 flex justify-center">
          <Logo variant="dark" />
        </div>

        <h1 className="text-center text-xl font-semibold tracking-tight text-white">Set up your workspace</h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Create a new organization or join one you were invited to.
        </p>

        {panel === 'choose' ? (
          <div className="mt-10 space-y-3">
            <button
              type="button"
              onClick={() => {
                setError('')
                resetCreateFlow()
                setPanel('create')
              }}
              className="flex w-full flex-col items-start rounded-xl border border-[#2b3858] bg-[#151b2e] px-5 py-4 text-left transition hover:border-[#3ECF8E]/45 hover:bg-[#1a2238]"
            >
              <span className="text-sm font-semibold text-white">Create organization</span>
              <span className="mt-1 text-xs text-slate-500">Start a new workspace for your team.</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setError('')
                setPanel('join')
              }}
              className="flex w-full flex-col items-start rounded-xl border border-[#2b3858] bg-[#151b2e] px-5 py-4 text-left transition hover:border-[#3ECF8E]/45 hover:bg-[#1a2238]"
            >
              <span className="text-sm font-semibold text-white">Join via invite</span>
              <span className="mt-1 text-xs text-slate-500">Use an invite link or token from email.</span>
            </button>
          </div>
        ) : null}

        {panel === 'create' ? (
          <div className="mt-10 space-y-6">
            <Stepper
              currentStep={createStep}
              labels={CREATE_STEP_LABELS}
              variant="dark"
            />

            {createStep === 1 ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleCreateBack}
                  className="text-xs font-medium text-slate-500 hover:text-[#3ECF8E]"
                >
                  ← Back
                </button>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Organization name
                  </span>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Acme Support"
                    autoComplete="organization"
                    className={inputClass}
                  />
                </label>
              </div>
            ) : null}

            {createStep === 2 ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleCreateBack}
                  className="text-xs font-medium text-slate-500 hover:text-[#3ECF8E]"
                >
                  ← Back
                </button>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Number of employees
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {COMPANY_SIZE_OPTIONS.map((option) => {
                      const selected = companySize === option
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setCompanySize(option)}
                          className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                            selected
                              ? 'border-[#3ECF8E] bg-[#3ECF8E]/15 text-[#3ECF8E]'
                              : 'border-[#2b3858] bg-[#151b2e] text-slate-300 hover:border-[#3ECF8E]/40'
                          }`}
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {createStep === 3 ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleCreateBack}
                  className="text-xs font-medium text-slate-500 hover:text-[#3ECF8E]"
                >
                  ← Back
                </button>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Primary use case <span className="font-normal text-slate-600">(optional)</span>
                  </span>
                  <select
                    value={useCase}
                    onChange={(e) => setUseCase(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select one</option>
                    {USE_CASE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {createStep === 4 ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleCreateBack}
                  className="text-xs font-medium text-slate-500 hover:text-[#3ECF8E]"
                >
                  ← Back
                </button>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Invite team emails <span className="font-normal text-slate-600">(optional)</span>
                  </span>
                  <textarea
                    rows={4}
                    value={teamEmails}
                    onChange={(e) => setTeamEmails(e.target.value)}
                    placeholder="alex@company.com, sam@company.com"
                    className={`${inputClass} resize-none`}
                  />
                </label>
                <p className="text-xs text-slate-600">Separate multiple emails with commas.</p>
              </div>
            ) : null}

            {error ? <p className="text-sm text-rose-400">{error}</p> : null}

            {createStep < 4 ? (
              <button
                type="button"
                onClick={validateAndAdvanceCreate}
                disabled={submitting}
                className="w-full rounded-lg bg-[#3ECF8E] py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-[#35c883] disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => finishCreateWorkspace([])}
                  disabled={submitting}
                  className="rounded-lg border border-[#2b3858] px-4 py-2.5 text-sm font-medium text-slate-400 transition hover:border-[#3ECF8E]/40 hover:text-slate-200 disabled:opacity-50"
                >
                  Skip invites
                </button>
                <button
                  type="button"
                  onClick={handleFinishInvites}
                  disabled={submitting}
                  className="min-w-[140px] flex-1 rounded-lg bg-[#3ECF8E] py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-[#35c883] disabled:opacity-50"
                >
                  {submitting ? 'Finishing…' : 'Finish setup'}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {panel === 'join' ? (
          <form className="mt-10 space-y-4" onSubmit={handleJoinContinue}>
            <button
              type="button"
              onClick={() => {
                setError('')
                setPanel('choose')
              }}
              className="text-xs font-medium text-slate-500 hover:text-[#3ECF8E]"
            >
              ← Back
            </button>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Invite link or token
              </span>
              <textarea
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                placeholder="https://…/invite?token=… or paste the token"
                rows={3}
                className="w-full resize-none rounded-lg border border-[#2b3858] bg-[#151b2e] px-3 py-2.5 text-sm text-white outline-none ring-[#3ECF8E]/40 placeholder:text-slate-600 focus:border-[#3ECF8E]/50 focus:ring-2"
              />
            </label>

            {error ? <p className="text-sm text-rose-400">{error}</p> : null}

            <button
              type="submit"
              className="w-full rounded-lg bg-[#3ECF8E] py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-[#35c883]"
            >
              Continue
            </button>
          </form>
        ) : null}
      </div>
    </main>
  )
}
