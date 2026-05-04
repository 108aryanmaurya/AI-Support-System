import { createContext, useContext, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const value = useAuth()
  const memo = useMemo(() => value, [value.user, value.session, value.loading])
  return <AuthContext.Provider value={memo}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuthContext must be used within AuthProvider')
  }
  return ctx
}
