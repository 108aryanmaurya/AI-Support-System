import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button.jsx'
import { Logo } from '../components/Logo.jsx'
import { StepAccount } from '../components/onboarding/StepAccount.jsx'
import registerBg from '../assets/registerbg.jpg'
import { signup } from '../services/auth.js'
import { getPendingInviteToken } from '../utils/pendingInviteStorage.js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const INITIAL_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
}

export default function Register() {
  const navigate = useNavigate()
  const location = useLocation()
  const inviteEmail =
    typeof location.state?.inviteEmail === 'string' ? location.state.inviteEmail.trim() : ''
  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    ...(inviteEmail ? { email: inviteEmail } : {}),
  }))
  const [errors, setErrors] = useState({})
  const [globalError, setGlobalError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (inviteEmail) {
      setForm((prev) => (prev.email ? prev : { ...prev, email: inviteEmail }))
    }
  }, [inviteEmail])

  function navigateAfterRegistration() {
    const pending = getPendingInviteToken()
    if (pending) {
      navigate(`/invite?token=${encodeURIComponent(pending)}`, { replace: true })
    } else {
      navigate('/continue', { replace: true })
    }
  }

  function onFieldChange(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
    if (errors[field]) {
      setErrors((previous) => ({ ...previous, [field]: '' }))
    }
  }

  function validate() {
    const nextErrors = {}
    if (!form.firstName.trim()) {
      nextErrors.firstName = 'Please enter your first name.'
    }
    if (!form.lastName.trim()) {
      nextErrors.lastName = 'Please enter your last name.'
    }
    if (!EMAIL_REGEX.test(form.email.trim())) {
      nextErrors.email = 'Please enter a valid email address.'
    }
    if (form.password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters.'
    }
    if (form.confirmPassword !== form.password) {
      nextErrors.confirmPassword = 'Passwords do not match.'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setGlobalError('')
    if (!validate()) return

    setIsSubmitting(true)
    const { error } = await signup(form.email.trim(), form.password, {
      data: {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
      },
    })
    setIsSubmitting(false)

    if (error) {
      setGlobalError(error.message)
      return
    }

    navigateAfterRegistration()
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 py-10">
      <img src={registerBg} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
      <div className="absolute inset-0 bg-black/80" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-[#3ECF8E]/25 bg-white p-7 shadow-[0_25px_80px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="mb-6 flex items-center justify-center">
          <Logo variant="dark" />
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">
          {inviteEmail ? 'Create your account to join' : 'Create your account'}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          {inviteEmail
            ? 'Use the invited email address, then accept the invitation.'
            : "Next you'll create or join a workspace from the onboarding screen."}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <StepAccount form={form} errors={errors} onFieldChange={onFieldChange} />
          {globalError ? <p className="text-sm text-rose-600">{globalError}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#3ECF8E] hover:text-[#1f8d5f]"
            >
              Back to home
            </button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account…' : 'Continue'}
            </Button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => navigate('/login', { state: location.state })}
            className="font-semibold text-[#1f8d5f] transition hover:text-[#166c46]"
          >
            Log in
          </button>
        </p>
      </div>
    </div>
  )
}
