const styles = {
  solid:
    'bg-[#3ECF8E] text-slate-900 border border-[#3ECF8E] hover:bg-[#35b87d] hover:border-[#35b87d] shadow-sm hover:shadow-md',
  outline:
    'bg-white text-slate-700 border border-slate-300 hover:border-[#3ECF8E] hover:text-[#1f8d5f] hover:bg-[#f8fffb]',
  ghost:
    'bg-transparent text-slate-700 border border-transparent hover:bg-slate-100',
}

export function Button({ variant = 'solid', className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3ECF8E] focus-visible:ring-offset-2 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
