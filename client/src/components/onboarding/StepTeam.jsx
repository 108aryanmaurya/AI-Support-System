export function StepTeam({ form, errors, onFieldChange }) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          Invite team emails <span className="text-slate-400">(optional)</span>
        </span>
        <textarea
          rows={4}
          value={form.teamEmails}
          onChange={(event) => onFieldChange('teamEmails', event.target.value)}
          placeholder="alex@company.com, sam@company.com"
          className="w-full resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
        />
      </label>
      <p className="mt-1 text-xs text-slate-500">Separate emails with commas.</p>
      {errors.teamEmails ? <p className="mt-2 text-xs text-rose-600">{errors.teamEmails}</p> : null}
    </div>
  )
}
