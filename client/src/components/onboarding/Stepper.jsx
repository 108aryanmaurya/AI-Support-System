const STEP_LABELS = ['Account', 'Workspace', 'Use Case', 'Team']

export function Stepper({ currentStep }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>{currentStep <= 4 ? `Step ${currentStep} of 4` : 'Completed'}</span>
        <span className="text-[#1f8d5f]">{currentStep <= 4 ? STEP_LABELS[currentStep - 1] : 'Done'}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {STEP_LABELS.map((label, index) => {
          const stepNumber = index + 1
          const isComplete = currentStep > stepNumber
          const isActive = currentStep === stepNumber
          return (
            <div
              key={label}
              className={`h-2 rounded-full ${
                isComplete || isActive ? 'bg-[#3ECF8E]' : 'bg-slate-200'
              }`}
              aria-label={label}
            />
          )
        })}
      </div>
    </div>
  )
}
