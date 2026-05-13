export function StepAccount({ form, errors, onFieldChange }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">First name</span>
          <input
            type="text"
            value={form.firstName}
            onChange={(event) => onFieldChange('firstName', event.target.value)}
            placeholder="Jane"
            autoComplete="given-name"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
          />
          {errors.firstName ? <p className="mt-1 text-xs text-rose-600">{errors.firstName}</p> : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Last name</span>
          <input
            type="text"
            value={form.lastName}
            onChange={(event) => onFieldChange('lastName', event.target.value)}
            placeholder="Doe"
            autoComplete="family-name"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
          />
          {errors.lastName ? <p className="mt-1 text-xs text-rose-600">{errors.lastName}</p> : null}
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
        <input
          type="email"
          value={form.email}
          onChange={(event) => onFieldChange('email', event.target.value)}
          placeholder="you@company.com"
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
        />
        {errors.email ? <p className="mt-1 text-xs text-rose-600">{errors.email}</p> : null}
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
        <input
          type="password"
          value={form.password}
          onChange={(event) => onFieldChange('password', event.target.value)}
          placeholder="Minimum 6 characters"
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
        />
        {errors.password ? <p className="mt-1 text-xs text-rose-600">{errors.password}</p> : null}
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Confirm password</span>
        <input
          type="password"
          value={form.confirmPassword}
          onChange={(event) => onFieldChange('confirmPassword', event.target.value)}
          placeholder="Re-enter your password"
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
        />
        {errors.confirmPassword ? (
          <p className="mt-1 text-xs text-rose-600">{errors.confirmPassword}</p>
        ) : null}
      </label>
    </div>
  )
}
