import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo.jsx'
import { apiFetch } from '../services/api.js'
import { useAuthContext } from '../context/AuthContext.jsx'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'
import {
  clearPendingInviteToken,
  getPendingInviteToken,
  setPendingInviteToken,
} from '../utils/pendingInviteStorage.js'
import { setLastOrgId } from '../utils/lastOrgStorage.js'

async function fetchInvitePreview(token) {
  const path = `/api/org/invite/${encodeURIComponent(token)}`
  const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}${path}`)
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { error: text || res.statusText }
  }
  if (!res.ok) {
    const err = Object.assign(new Error(body?.error || 'Request failed'), {
      status: res.status,
      body,
    })
    throw err
  }
  return body
}

export default function InvitePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuthContext()
  const { refresh } = useOrganizationContext()

  const tokenParam = searchParams.get('token')?.trim()

  const resolvedToken = useMemo(() => {
    if (tokenParam) return tokenParam
    return getPendingInviteToken()
  }, [tokenParam])

  useEffect(() => {
    if (resolvedToken) setPendingInviteToken(resolvedToken)
  }, [resolvedToken])

  const [previewPhase, setPreviewPhase] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [acceptError, setAcceptError] = useState('')
  const [accepting, setAccepting] = useState(false)

  /** Guests: send to login with return path (token stays in localStorage too). */
  useEffect(() => {
    if (authLoading) return
    if (!resolvedToken) return
    if (user) return

    navigate('/login', {
      replace: true,
      state: {
        from: {
          pathname: '/invite',
          search: `?token=${encodeURIComponent(resolvedToken)}`,
        },
      },
    })
  }, [authLoading, resolvedToken, user, navigate])

  const loadPreview = useCallback(async () => {
    if (!resolvedToken || !user) return
    setPreviewPhase('loading')
    setFetchError(null)
    try {
      const data = await fetchInvitePreview(resolvedToken)
      setPreview(data)
      setPreviewPhase('ready')
    } catch (e) {
      const status = e?.status
      if (status === 410) setFetchError('expired')
      else if (status === 404) setFetchError('not-found')
      else setFetchError('invalid')
      setPreviewPhase('error')
    }
  }, [resolvedToken, user])

  useEffect(() => {
    if (authLoading || !resolvedToken || !user) return
    void loadPreview()
  }, [authLoading, resolvedToken, user, loadPreview])

  async function accept() {
    if (!resolvedToken) return
    setAcceptError('')
    setAccepting(true)
    try {
      const data = await apiFetch('/api/org/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token: resolvedToken }),
      })
      const organizationId = data?.organizationId
      if (!organizationId) throw new Error('Missing organization after accept.')

      clearPendingInviteToken()
      await refresh()
      setLastOrgId(organizationId)
      navigate(`/org/${organizationId}/inbox`, { replace: true })
    } catch (e) {
      setAcceptError(e?.message || 'Could not accept invite.')
      setAccepting(false)
    }
  }

  if (authLoading) {
    return <InviteLoading message="Loading…" />
  }

  if (!resolvedToken) {
    return (
      <InviteShell>
        <h1 className="mt-2 text-xl font-semibold text-white">Invite link needed</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Open the invite link from your email, or paste it on the onboarding page under “Join via invite”.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            to="/login"
            className="rounded-lg bg-[#3ECF8E] py-2.5 text-center text-sm font-semibold text-slate-900 hover:bg-[#35c883]"
          >
            Log in
          </Link>
          <Link to="/register" className="rounded-lg border border-[#2b3858] py-2.5 text-center text-sm font-medium text-slate-200 hover:border-[#3ECF8E]/40">
            Create account
          </Link>
          <Link to="/onboarding" className="text-center text-sm text-slate-500 hover:text-[#3ECF8E]">
            Back to onboarding
          </Link>
        </div>
      </InviteShell>
    )
  }

  if (!user) {
    return <InviteLoading message="Redirecting to sign in…" />
  }

  if (previewPhase === 'loading' || previewPhase === 'idle') {
    return <InviteLoading message="Loading invitation…" />
  }

  if (previewPhase === 'error' && fetchError) {
    const copy =
      fetchError === 'expired'
        ? 'This invite has expired. Ask an admin to send a new invitation.'
        : fetchError === 'not-found'
          ? 'We could not find this invitation. Check the link or request a new invite.'
          : 'This invitation is no longer valid.'

    return (
      <InviteShell>
        <div className="mt-2 rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-left">
          <p className="text-sm font-medium text-rose-200">{copy}</p>
        </div>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            to="/onboarding"
            className="rounded-lg border border-[#2b3858] py-2.5 text-center text-sm font-medium text-slate-200 hover:border-[#3ECF8E]/40"
          >
            Go to onboarding
          </Link>
          <Link to="/login" className="text-center text-sm text-slate-500 hover:text-[#3ECF8E]">
            Sign in with another account
          </Link>
        </div>
      </InviteShell>
    )
  }

  const orgName = preview?.organization?.name ?? 'Workspace'
  const role = preview?.invite?.role ?? '—'

  return (
    <InviteShell>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#3ECF8E]/90">You&apos;re invited</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">{orgName}</h1>
      <p className="mt-3 text-sm text-slate-400">
        Role: <span className="font-medium text-slate-200">{role}</span>
      </p>
      {preview?.invite?.email ? (
        <p className="mt-2 text-xs text-slate-500">
          Invited email: <span className="text-slate-400">{preview.invite.email}</span>
        </p>
      ) : null}

      {acceptError ? (
        <p className="mt-6 text-sm text-rose-400">{acceptError}</p>
      ) : null}

      <button
        type="button"
        disabled={accepting}
        onClick={() => void accept()}
        className="mt-10 w-full rounded-lg bg-[#3ECF8E] py-3 text-sm font-semibold text-slate-900 transition hover:bg-[#35c883] disabled:opacity-50"
      >
        {accepting ? 'Joining…' : 'Accept & open inbox'}
      </button>

      <button
        type="button"
        onClick={() => {
          clearPendingInviteToken()
          navigate('/onboarding', { replace: true })
        }}
        className="mt-4 text-sm text-slate-500 hover:text-slate-300"
      >
        Cancel
      </button>
    </InviteShell>
  )
}

function InviteLoading({ message }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0b1020] px-6 text-slate-300">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3ECF8E]/30 border-t-[#3ECF8E]" />
      <p className="text-sm text-slate-500">{message}</p>
    </main>
  )
}

function InviteShell({ children }) {
  return (
    <main className="min-h-screen bg-[#0b1020] px-6 py-16 text-slate-100">
      <div className="mx-auto w-full max-w-md">
        <div className="flex justify-center">
          <Logo variant="dark" />
        </div>
        <div className="mt-10 text-center">{children}</div>
      </div>
    </main>
  )
}
