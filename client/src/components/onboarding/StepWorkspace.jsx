const COMPANY_SIZE_OPTIONS = ['1-9', '10-30', '31-50', '50+']

export function StepWorkspace({ form, errors, onFieldChange }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">First Name</span>
          <input
            type="text"
            value={form.firstName}
            onChange={(event) => onFieldChange('firstName', event.target.value)}
            placeholder="Aaryan"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
          />
          {errors.firstName ? <p className="mt-1 text-xs text-rose-600">{errors.firstName}</p> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Last Name</span>
          <input
            type="text"
            value={form.lastName}
            onChange={(event) => onFieldChange('lastName', event.target.value)}
            placeholder="Sharma"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
          />
          {errors.lastName ? <p className="mt-1 text-xs text-rose-600">{errors.lastName}</p> : null}
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Job Title</span>
        <input
          type="text"
          value={form.jobTitle}
          onChange={(event) => onFieldChange('jobTitle', event.target.value)}
          placeholder="Head of Support"
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
        />
        {errors.jobTitle ? <p className="mt-1 text-xs text-rose-600">{errors.jobTitle}</p> : null}
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Company / Workspace Name</span>
        <input
          type="text"
          value={form.workspaceName}
          onChange={(event) => onFieldChange('workspaceName', event.target.value)}
          placeholder="Acme Support"
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
        />
        {errors.workspaceName ? <p className="mt-1 text-xs text-rose-600">{errors.workspaceName}</p> : null}
      </label>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Number of employees</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {COMPANY_SIZE_OPTIONS.map((option) => {
            const selected = form.companySize === option
            return (
              <button
                key={option}
                type="button"
                onClick={() => onFieldChange('companySize', option)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  selected
                    ? 'border-[#3ECF8E] bg-[#3ECF8E]/15 text-[#1f8d5f]'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-[#3ECF8E]/70 hover:text-[#1f8d5f]'
                }`}
              >
                {option}
              </button>
            )
          })}
        </div>
        {errors.companySize ? <p className="mt-1 text-xs text-rose-600">{errors.companySize}</p> : null}
      </div>
    </div>
  )
}
