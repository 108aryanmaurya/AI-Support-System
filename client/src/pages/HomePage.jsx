import { useState } from 'react'
import { useAuthContext } from '../context/AuthContext.jsx'
import { login, logout, signup } from '../services/auth.js'
import { apiFetch } from '../services/api.js'
import { APP_NAME } from '../utils/constants.js'

export default function HomePage() {
  const { user, loading, isAuthenticated } = useAuthContext()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [formError, setFormError] = useState('')
  const [apiCheck, setApiCheck] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    const action = mode === 'signup' ? signup : login
    const { error } = await action(email, password)
    if (error) setFormError(error.message)
  }

  async function checkApi() {
    try {
      const data = await apiFetch('/api/auth/me')
      setApiCheck(JSON.stringify(data, null, 2))
    } catch (err) {
      setApiCheck(err.message)
    }
  }

  if (loading) {
    return (
      <main className="page">
        <p>Loading session…</p>
      </main>
    )
  }

  return (
    <main className="page">
      <header className="hero">
        <h1>{APP_NAME}</h1>
        <p className="lede">AI-powered customer support copilot — monorepo scaffold.</p>
      </header>

      {!isAuthenticated ? (
        <section className="card">
          <div className="tabs">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Log in
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => setMode('signup')}
            >
              Sign up
            </button>
          </div>
          <form onSubmit={handleSubmit} className="form">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>
            {formError ? <p className="error">{formError}</p> : null}
            <button type="submit">{mode === 'signup' ? 'Create account' : 'Log in'}</button>
          </form>
        </section>
      ) : (
        <section className="card">
          <p>
            Signed in as <strong>{user.email}</strong>
          </p>
          <div className="actions">
            <button type="button" onClick={() => logout()}>
              Log out
            </button>
            <button type="button" onClick={checkApi}>
              Test <code>/api/auth/me</code>
            </button>
          </div>
          {apiCheck ? (
            <pre className="api-out">{apiCheck}</pre>
          ) : (
            <p className="hint">Use “Test /api/auth/me” to verify JWT with the Express API.</p>
          )}
        </section>
      )}
    </main>
  )
}
