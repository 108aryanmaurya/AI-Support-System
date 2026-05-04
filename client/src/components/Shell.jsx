import { APP_NAME } from '../utils/constants.js'

export function Shell({ children }) {
  return (
    <div className="shell">
      <header className="topbar">
        <span className="logo">{APP_NAME}</span>
      </header>
      {children}
    </div>
  )
}
