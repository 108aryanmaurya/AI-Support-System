import { ChevronDown, CircleHelp, Loader2 } from 'lucide-react';
import { useState } from 'react';

/** Intercom-style orange toggle for messenger settings. */
export function MessengerToggle({ checked, onChange, disabled = false, id }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a59]/50 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${checked ? 'bg-[#ff7a59]' : 'bg-[#2d3648]'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export function MessengerSegmentedControl({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg bg-[#1a2238] p-1">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            value === opt.id
              ? 'bg-[#2b3858] text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function MessengerSettingsRow({
  label,
  checked,
  onChange,
  disabled = false,
  helpText,
  comingSoon = false,
  children,
}) {
  const rowDisabled = disabled || comingSoon;
  return (
    <div className="border-b border-[#1d253a] py-4 last:border-b-0">
      <div className="flex items-start gap-4">
        <MessengerToggle
          checked={comingSoon ? false : checked}
          onChange={onChange}
          disabled={rowDisabled}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`text-sm font-semibold ${rowDisabled ? 'text-slate-500' : 'text-white'}`}
            >
              {label}
            </span>
            {helpText ? (
              <span title={helpText} className="text-slate-500">
                <CircleHelp className="h-4 w-4" aria-hidden />
              </span>
            ) : null}
            {comingSoon ? (
              <span className="rounded bg-[#1a2238] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Soon
              </span>
            ) : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function MessengerAccordionSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-[#2b3858] bg-[#12192c]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        aria-expanded={open}
      >
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <ChevronDown
          className={`h-5 w-5 text-slate-400 transition ${open ? 'rotate-0' : '-rotate-90'}`}
        />
      </button>
      {open ? <div className="px-5 pb-5">{children}</div> : null}
    </section>
  );
}

export function MessengerTabBar({ tabs, activeTab, onChange }) {
  return (
    <nav
      className="flex gap-6 overflow-x-auto border-b border-[#1d253a] pb-0"
      aria-label="Messenger settings"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        const disabled = tab.disabled;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(tab.id)}
            className={`relative shrink-0 pb-3 text-sm font-medium transition ${
              disabled
                ? 'cursor-not-allowed text-slate-600'
                : active
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
            {active && !disabled ? (
              <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-[#ff7a59]" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export function MessengerSavingIndicator({ saving }) {
  if (!saving) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Saving…
    </span>
  );
}
