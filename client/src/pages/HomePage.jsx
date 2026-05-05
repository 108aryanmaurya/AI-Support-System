import { useState } from 'react'
import { z } from 'zod'
import { useAuthContext } from '../context/AuthContext.jsx'
import { login, logout, signup } from '../services/auth.js'
import { apiFetch } from '../services/api.js'
import { APP_NAME } from '../utils/constants.js'

const authFormSchema = z.object({
  email: z.email('Please enter a valid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
})

export default function HomePage() {
  const { user, loading, isAuthenticated } = useAuthContext()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiCheck, setApiCheck] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setFieldErrors({})
    const payload = {
      email: email.trim(),
      password,
    }
    const parsed = authFormSchema.safeParse(payload)
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors)
      return
    }
    const action = mode === 'signup' ? signup : login
    const { error } = await action(parsed.data.email, parsed.data.password)
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
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: undefined }))
                  }
                }}
                required
                autoComplete="email"
              />
              {fieldErrors.email?.[0] ? <p className="error">{fieldErrors.email[0]}</p> : null}
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }))
                  }
                }}
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              {fieldErrors.password?.[0] ? <p className="error">{fieldErrors.password[0]}</p> : null}
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
