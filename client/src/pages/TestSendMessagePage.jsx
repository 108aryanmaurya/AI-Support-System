import { useMemo, useState } from 'react'
import { apiFetch } from '../services/api.js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_MESSAGE_LENGTH = 4000

export default function TestSendMessagePage() {
  const { orgId: orgFromRoute } = useParams()
  const organizationId =
    (typeof orgFromRoute === 'string' && orgFromRoute.trim()) ||
    ''

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const normalizedEmail = email.trim().toLowerCase()
  const normalizedName = name.trim()
  const normalizedMessage = message.trim()

  const validationError = useMemo(() => {
    if (!normalizedEmail) return 'Email is required.'
    if (!EMAIL_REGEX.test(normalizedEmail)) return 'Email must be valid.'
    if (!normalizedName) return 'Name is required.'
    if (!normalizedMessage) return 'Message is required.'
    if (normalizedMessage.length > MAX_MESSAGE_LENGTH) {
      return `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`
    }
    return ''
  }, [organizationId, normalizedEmail, normalizedName, normalizedMessage])

  const canSubmit = !loading && !validationError

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await apiFetch(
        `/api/org/${encodeURIComponent(organizationId)}/messages/incoming`,
        {
          method: 'POST',
          body: JSON.stringify({
            customer: {
              email: normalizedEmail,
              name: normalizedName,
            },
            message: normalizedMessage,
          }),
        },
      )

      setResult(response)
    } catch (err) {
      setError(err?.message || 'Failed to send message.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Debug: Send Incoming Message</h1>
        <p className="mt-1 text-sm text-slate-600">
          Internal testing tool for <code>POST /api/org/:orgId/messages/incoming</code>.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-slate-500"
              placeholder="customer@example.com"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-slate-500"
              placeholder="Customer Name"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-slate-500"
              placeholder="Type test message"
            />
          </label>

          {validationError ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {validationError}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          {result?.conversationId ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <div>
                <strong>conversationId:</strong> {result.conversationId}
              </div>
              {result.messageId ? (
                <div>
                  <strong>messageId:</strong> {result.messageId}
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </main>
  )
}
