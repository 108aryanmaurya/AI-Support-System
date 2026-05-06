import { useMemo, useState } from 'react'
import { Button } from '../components/Button.jsx'
import { Logo } from '../components/Logo.jsx'
import { Stepper } from '../components/onboarding/Stepper.jsx'
import { StepAccount } from '../components/onboarding/StepAccount.jsx'
import { StepWorkspace } from '../components/onboarding/StepWorkspace.jsx'
import { StepUseCase } from '../components/onboarding/StepUseCase.jsx'
import { StepTeam } from '../components/onboarding/StepTeam.jsx'
import registerBg from '../assets/registerbg.jpg'
import { signup } from '../services/auth.js'
import { completeOnboarding } from '../services/onboardingService.js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const INITIAL_FORM = {
  email: '',
  password: '',
  confirmPassword: '',
  firstName: '',
  lastName: '',
  jobTitle: '',
  workspaceName: '',
  companySize: '',
  useCase: '',
  teamEmails: '',
}

export default function Register({ onBackToHome = () => {}, onGoToDashboard = () => {} }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(INITIAL_FORM)
  const [errors, setErrors] = useState({})
  const [globalError, setGlobalError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessingRegister, setIsProcessingRegister] = useState(false)
  const [signedUp, setSignedUp] = useState(false)

  const canGoBack = step > 1 && step <= 4

  const parsedTeamEmails = useMemo(() => {
    return form.teamEmails
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }, [form.teamEmails])

  function onFieldChange(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
    if (errors[field]) {
      setErrors((previous) => ({ ...previous, [field]: '' }))
    }
  }

  function validateCurrentStep(currentStep) {
    const nextErrors = {}

    if (currentStep === 1) {
      if (!EMAIL_REGEX.test(form.email.trim())) {
        nextErrors.email = 'Please enter a valid email address.'
      }
      if (form.password.length < 6) {
        nextErrors.password = 'Password must be at least 6 characters.'
      }
      if (form.confirmPassword !== form.password) {
        nextErrors.confirmPassword = 'Passwords do not match.'
      }
    }

    if (currentStep === 2) {
      if (!form.firstName.trim()) {
        nextErrors.firstName = 'First name is required.'
      }
      if (!form.lastName.trim()) {
        nextErrors.lastName = 'Last name is required.'
      }
      if (!form.jobTitle.trim()) {
        nextErrors.jobTitle = 'Job title is required.'
      }
      if (!form.workspaceName.trim()) {
        nextErrors.workspaceName = 'Workspace name is required.'
      }
      if (!form.companySize) {
        nextErrors.companySize = 'Please select a company size range.'
      }
    }

    if (currentStep === 4) {
      const invalidEmail = parsedTeamEmails.find((email) => !EMAIL_REGEX.test(email))
      if (invalidEmail) {
        nextErrors.teamEmails = `Invalid email: ${invalidEmail}`
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleStepOneSignup() {
    setGlobalError('')
    setIsSubmitting(true)
    const { error } = await signup(form.email.trim(), form.password)
    setIsSubmitting(false)

    if (error) {
      setGlobalError(error.message)
      return false
    }

    setSignedUp(true)
    return true
  }

  async function completeRegistration() {
    setGlobalError('')
    setIsProcessingRegister(true)

    try {
      await completeOnboarding({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        jobTitle: form.jobTitle.trim(),
        companyName: form.workspaceName.trim(),
        companySize: form.companySize,
        useCase: form.useCase || undefined,
        invitedEmails: parsedTeamEmails,
      })
      setStep(5)
    } catch (error) {
      setGlobalError(error.message || 'Failed to complete registration.')
    } finally {
      setIsProcessingRegister(false)
    }
  }

  async function handleNext() {
    if (!validateCurrentStep(step)) return

    if (step === 1 && !signedUp) {
      const success = await handleStepOneSignup()
      if (!success) return
    }

    if (step === 4) {
      await completeRegistration()
      return
    }

    setStep((previous) => previous + 1)
  }

  async function handleSkipTeam() {
    setErrors({})
    await completeRegistration()
  }

  function handleBack() {
    if (!canGoBack) return
    setErrors({})
    setGlobalError('')
    setStep((previous) => previous - 1)
  }

  function renderStep() {
    if (step === 1) {
      return <StepAccount form={form} errors={errors} onFieldChange={onFieldChange} />
    }
    if (step === 2) {
      return <StepWorkspace form={form} errors={errors} onFieldChange={onFieldChange} />
    }
    if (step === 3) {
      return <StepUseCase form={form} errors={errors} onFieldChange={onFieldChange} />
    }
    if (step === 4) {
      return <StepTeam form={form} errors={errors} onFieldChange={onFieldChange} />
    }
    return (
      <div className="rounded-2xl border border-[#3ECF8E]/35 bg-[#f4fff8] p-5 text-center">
        <h2 className="text-2xl font-bold text-slate-900">You are all set!</h2>
        <p className="mt-2 text-sm text-slate-600">
          Your workspace is ready and onboarding is complete.
        </p>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 py-10">
      <img src={registerBg} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
      <div className="absolute inset-0 bg-black/80" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-[#3ECF8E]/25 bg-white p-7 shadow-[0_25px_80px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="mb-7 flex items-center justify-center">
          <Logo />
        </div>

        <Stepper currentStep={step} />

        <div className="mt-6">{renderStep()}</div>
        {globalError ? <p className="mt-4 text-sm text-rose-600">{globalError}</p> : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={canGoBack ? handleBack : onBackToHome}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#3ECF8E] hover:text-[#1f8d5f]"
          >
            {canGoBack ? 'Back' : 'Back to home'}
          </button>

          <div className="flex items-center gap-3">
            {step === 4 ? (
              <button
                type="button"
                onClick={handleSkipTeam}
                disabled={isProcessingRegister}
                className="text-sm font-semibold text-slate-500 transition hover:text-[#1f8d5f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Skip
              </button>
            ) : null}

            {step < 5 ? (
              <Button onClick={handleNext} disabled={isSubmitting || isProcessingRegister}>
                {step === 4
                  ? isProcessingRegister
                    ? 'Finishing...'
                    : 'Finish Setup'
                  : isSubmitting
                    ? 'Creating...'
                    : 'Next'}
              </Button>
            ) : (
              <Button onClick={onGoToDashboard}>Go to Dashboard</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
