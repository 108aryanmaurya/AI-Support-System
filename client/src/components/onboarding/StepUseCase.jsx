const useCaseOptions = [
  'Customer Support',
  'Technical Support',
  'Sales Queries',
  'Internal Support',
]

export function StepUseCase({ form, errors, onFieldChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        Primary Use Case <span className="text-slate-400">(optional)</span>
      </span>
      <select
        value={form.useCase}
        onChange={(event) => onFieldChange('useCase', event.target.value)}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
      >
        <option value="">Select one</option>
        {useCaseOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {errors.useCase ? <p className="mt-1 text-xs text-rose-600">{errors.useCase}</p> : null}
    </label>
  )
}
