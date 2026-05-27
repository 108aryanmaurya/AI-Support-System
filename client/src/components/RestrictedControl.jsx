import { cloneElement, isValidElement } from 'react'

/**
 * Disables a control (or hides it) and shows a floating reason on hover/focus.
 *
 * @param {object} props
 * @param {boolean} props.restricted — when true, action is blocked
 * @param {string | null | undefined} props.reason — tooltip copy
 * @param {'disable' | 'hide'} [props.mode='disable']
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children — single element (button, input, etc.)
 */
export function RestrictedControl({
  restricted,
  reason,
  mode = 'disable',
  className = '',
  children,
}) {
  if (mode === 'hide' && restricted) {
    return null
  }

  if (!restricted) {
    return <span className={className}>{children}</span>
  }

  const child = isValidElement(children)
    ? cloneElement(children, {
        disabled: true,
        'aria-disabled': true,
        className: [children.props.className, 'pointer-events-none']
          .filter(Boolean)
          .join(' '),
      })
    : children

  return (
    <span
      className={`group/restrict relative inline-flex ${className}`}
      tabIndex={0}
      role="presentation"
    >
      <span className="inline-flex w-full cursor-not-allowed opacity-50">{child}</span>
      {reason ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-[80] mb-2 hidden w-max max-w-[260px] -translate-x-1/2 rounded-lg border border-[#3a4f7a] bg-[#0c1220] px-3 py-2 text-left text-[11px] font-normal leading-snug text-slate-100 shadow-xl group-hover/restrict:block group-focus-within/restrict:block"
        >
          {reason}
          <span
            className="absolute left-1/2 top-full -translate-x-1/2 border-[6px] border-transparent border-t-[#0c1220]"
            aria-hidden
          />
        </span>
      ) : null}
    </span>
  )
}
