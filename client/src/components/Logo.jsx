import logo from '../assets/logo.png'

export function Logo({ className = '' }) {
  return (
    <div className={`inline-flex items-center ${className}`}>
      <img src={logo} alt="ResolveAI" className="h-9 w-auto object-contain md:h-30" />
    </div>
  )
}
