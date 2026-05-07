import logo from '../assets/logo.png'
import logoDark from '../assets/logodm.png'

export function Logo({ className = '', variant = 'default' }) {
  const src = variant === 'dark' ? logoDark : logo
  return (
    <div className={`inline-flex items-center ${className}`}>
      <img src={src} alt="ResolveAI" className="h-9 w-auto object-contain md:h-30" />
    </div>
  )
}
