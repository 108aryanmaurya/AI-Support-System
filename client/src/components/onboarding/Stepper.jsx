const STEP_LABELS_DEFAULT = ['Account', 'Workspace', 'Use Case', 'Team']

export function Stepper({
  currentStep,
  labels = STEP_LABELS_DEFAULT,
  variant = 'light',
}) {
  const total = labels.length
  const inactiveBar = variant === 'dark' ? 'bg-[#2b3858]' : 'bg-slate-200'
  const labelMuted = variant === 'dark' ? 'text-slate-500' : 'text-slate-500'
  const accent = variant === 'dark' ? 'text-[#3ECF8E]' : 'text-[#1f8d5f]'

  const gridClass =
    total === 4 ? 'grid-cols-4' : total === 3 ? 'grid-cols-3' : 'grid-cols-2'

  return (
    <div>
      <div
        className={`mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-wide ${labelMuted}`}
      >
        <span>{currentStep <= total ? `Step ${currentStep} of ${total}` : 'Completed'}</span>
        <span className={accent}>
          {currentStep <= total ? labels[currentStep - 1] : 'Done'}
        </span>
      </div>
      <div className={`grid gap-2 ${gridClass}`}>
        {labels.map((label, index) => {
          const stepNumber = index + 1
          const isComplete = currentStep > stepNumber
          const isActive = currentStep === stepNumber
          return (
            <div
              key={label}
              className={`h-2 rounded-full ${
                isComplete || isActive ? 'bg-[#3ECF8E]' : inactiveBar
              }`}
              aria-label={label}
            />
          )
        })}
      </div>
    </div>
  )
}
