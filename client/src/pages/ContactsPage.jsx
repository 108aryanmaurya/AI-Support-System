import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Users, MessageSquare, Plus, ChevronDown, X, UserPlus, UploadCloud } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { createOrgCustomer, fetchOrgCustomers } from '../services/customersApi.js'

function initialsFromName(name, email) {
  const n = typeof name === 'string' ? name.trim() : ''
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  const e = typeof email === 'string' ? email.trim() : ''
  return e ? e.slice(0, 2).toUpperCase() : 'CU'
}

function ContactRow({ row }) {
  const name = row?.name?.trim() || 'Unknown'
  const email = row?.email?.trim() || 'No email'
  const initials = initialsFromName(name, email)
  const customerType = row?.customer_type === 'LEAD' ? 'LEAD' : 'USER'
  const userId = typeof row?.user_id === 'string' && row.user_id.trim() ? row.user_id.trim() : '-'
  return (
    <tr className="border-b border-[#27314a] text-sm text-slate-200 last:border-b-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2b3652] text-[10px] font-semibold text-slate-100">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm text-white">{name}</p>
            <p className="truncate text-xs text-slate-400">{email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-300">{customerType}</td>
      <td className="px-4 py-3 text-slate-300">{userId}</td>
      <td className="px-4 py-3 text-slate-300">Unknown</td>
    </tr>
  )
}

export default function ContactsPage() {
  const { orgId } = useParams()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [createLeadOpen, setCreateLeadOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const menuRef = useRef(null)

  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    userId: '',
  })
  const [newLeadForm, setNewLeadForm] = useState({
    name: '',
    email: '',
  })

  const loadContacts = async (nextQuery = query) => {
    if (!orgId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetchOrgCustomers(orgId, { query: nextQuery.trim(), limit: 250 })
      setRows(res?.items ?? [])
    } catch (e) {
      setRows([])
      setError(e?.message || 'Failed to load contacts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetchOrgCustomers(orgId, { query: query.trim(), limit: 250 })
        if (!cancelled) setRows(res?.items ?? [])
      } catch (e) {
        if (!cancelled) {
          setRows([])
          setError(e?.message || 'Failed to load contacts.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [orgId, query])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [menuOpen])

  const contactCountLabel = useMemo(() => `${rows.length} ${rows.length === 1 ? 'user' : 'users'}`, [rows.length])
  const canSubmitUser = useMemo(() => {
    const emailOk = newUserForm.email.trim().length > 0
    const userIdOk = newUserForm.userId.trim().length > 0
    return emailOk || userIdOk
  }, [newUserForm.email, newUserForm.userId])
  const canSubmitLead = useMemo(() => newLeadForm.email.trim().length > 0, [newLeadForm.email])

  const submitNewUser = async () => {
    if (!orgId || !canSubmitUser) return
    setSubmitting(true)
    setFormError('')
    try {
      await createOrgCustomer(orgId, {
        type: 'USER',
        name: newUserForm.name.trim() || null,
        email: newUserForm.email.trim() || null,
        user_id: newUserForm.userId.trim() || null,
      })
      setCreateUserOpen(false)
      setNewUserForm({ name: '', email: '', userId: '' })
      await loadContacts()
    } catch (e) {
      setFormError(e?.message || 'Failed to create user.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitNewLead = async () => {
    if (!orgId || !canSubmitLead) return
    setSubmitting(true)
    setFormError('')
    try {
      await createOrgCustomer(orgId, {
        type: 'LEAD',
        name: newLeadForm.name.trim() || null,
        email: newLeadForm.email.trim() || null,
      })
      setCreateLeadOpen(false)
      setNewLeadForm({ name: '', email: '' })
      await loadContacts()
    } catch (e) {
      setFormError(e?.message || 'Failed to create lead.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0f1422] text-slate-100">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 py-3">
        <div className="flex items-center justify-between rounded-t-xl border border-b-0 border-[#27314a] bg-[#121a2b] px-4 py-3">
          <div className="flex items-center gap-2">
            <Users size={16} aria-hidden className="text-slate-300" />
            <h1 className="text-lg font-semibold text-white">All users</h1>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-[#334060] bg-[#101729] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#18233b]"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <Plus size={14} aria-hidden />
              New users or leads
              <ChevronDown size={14} aria-hidden />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-xl border border-[#334060] bg-[#121a2b] p-2 shadow-xl">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-100 hover:bg-[#1a2440]"
                  onClick={() => {
                    setCreateUserOpen(true)
                    setCreateLeadOpen(false)
                    setMenuOpen(false)
                    setFormError('')
                  }}
                >
                  <UserPlus size={15} /> Create new user
                </button>
                <button
                  type="button"
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-100 hover:bg-[#1a2440]"
                  onClick={() => {
                    setCreateLeadOpen(true)
                    setCreateUserOpen(false)
                    setMenuOpen(false)
                    setFormError('')
                  }}
                >
                  <Plus size={15} /> Create new lead
                </button>
                <button
                  type="button"
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-100 hover:bg-[#1a2440]"
                >
                  <UploadCloud size={15} /> Import people
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 border-x border-[#27314a] bg-[#121a2b] px-4 py-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users..."
              className="w-full rounded-md border border-[#334060] bg-[#0f1728] py-2 pl-8 pr-3 text-sm text-slate-100 outline-none focus:border-[#4f6290] placeholder:text-slate-500"
            />
          </div>
          <button className="rounded-md border border-[#334060] bg-[#101729] px-2.5 py-2 text-xs text-slate-200">
            Add filter
          </button>
          <button className="rounded-md border border-[#334060] bg-[#101729] px-2.5 py-2 text-xs text-slate-200">
            Save segment
          </button>
        </div>

        <div className="flex items-center gap-2 border-x border-[#27314a] bg-[#121a2b] px-4 py-2 text-xs text-slate-300">
          <span className="font-medium text-slate-100">{contactCountLabel}</span>
          <button className="inline-flex items-center gap-1 rounded-md border border-[#334060] bg-[#101729] px-2 py-1">
            <MessageSquare size={12} /> New message
          </button>
          <button className="inline-flex items-center gap-1 rounded-md border border-[#334060] bg-[#101729] px-2 py-1">
            More <ChevronDown size={12} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-b-xl border border-[#27314a] bg-[#121a2b]">
          {error ? (
            <div className="px-4 py-4 text-sm text-red-300">{error}</div>
          ) : loading ? (
            <div className="px-4 py-4 text-sm text-slate-400">Loading contacts...</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-400">No contacts found.</div>
          ) : (
            <table className="min-w-full table-fixed">
              <thead className="border-b border-[#27314a] bg-[#101729] text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">User ID</th>
                  <th className="px-4 py-2">City</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ContactRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {(createUserOpen || createLeadOpen) ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
          {createUserOpen ? (
            <div className="w-full max-w-[640px] overflow-hidden rounded-xl border border-[#334060] bg-[#121a2b] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#27314a] px-5 py-4">
                <h2 className="text-[32px] font-semibold text-white">Create a new user</h2>
                <button className="text-slate-300 hover:text-white" onClick={() => setCreateUserOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4 px-5 py-4">
                <p className="text-sm text-slate-300">
                  An Email or User ID is required to create a new user.
                </p>
                <label className="block text-sm text-slate-200">
                  Name (optional)
                  <input
                    className="mt-1 w-full rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-slate-100 outline-none focus:border-[#4f6290]"
                    placeholder="John Doe"
                    value={newUserForm.name}
                    onChange={(e) => setNewUserForm((s) => ({ ...s, name: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-slate-200">
                  Email
                  <input
                    className="mt-1 w-full rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-slate-100 outline-none focus:border-[#4f6290]"
                    placeholder="john.doe@example.com"
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm((s) => ({ ...s, email: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-slate-200">
                  User ID
                  <input
                    className="mt-1 w-full rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-slate-100 outline-none focus:border-[#4f6290]"
                    placeholder="1234567"
                    value={newUserForm.userId}
                    onChange={(e) => setNewUserForm((s) => ({ ...s, userId: e.target.value }))}
                  />
                  <span className="mt-1 block text-xs text-slate-400">A unique user identifier that won't change.</span>
                </label>
                {formError ? <p className="text-sm text-red-300">{formError}</p> : null}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-[#27314a] px-5 py-3">
                <button
                  type="button"
                  className="rounded-full bg-[#202b44] px-4 py-2 text-sm font-medium text-white hover:bg-[#27314e]"
                  onClick={() => setCreateUserOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canSubmitUser || submitting}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
                  onClick={submitNewUser}
                >
                  {submitting ? 'Creating...' : 'Create a user'}
                </button>
              </div>
            </div>
          ) : null}

          {createLeadOpen ? (
            <div className="w-full max-w-[620px] overflow-hidden rounded-xl border border-[#334060] bg-[#121a2b] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#27314a] px-5 py-4">
                <h2 className="text-[32px] font-semibold text-white">Create a new lead</h2>
                <button className="text-slate-300 hover:text-white" onClick={() => setCreateLeadOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4 px-5 py-4">
                <label className="block text-sm text-slate-200">
                  Name
                  <input
                    className="mt-1 w-full rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-slate-100 outline-none focus:border-[#4f6290]"
                    placeholder="John Doe"
                    value={newLeadForm.name}
                    onChange={(e) => setNewLeadForm((s) => ({ ...s, name: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-slate-200">
                  Email
                  <input
                    className="mt-1 w-full rounded-md border border-[#334060] bg-[#0f1728] px-3 py-2 text-slate-100 outline-none focus:border-[#4f6290]"
                    placeholder="john.doe@example.com"
                    value={newLeadForm.email}
                    onChange={(e) => setNewLeadForm((s) => ({ ...s, email: e.target.value }))}
                  />
                </label>
                <span className="block text-xs text-slate-400">To add multiple leads use an import tool</span>
                {formError ? <p className="text-sm text-red-300">{formError}</p> : null}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-[#27314a] px-5 py-3">
                <button
                  type="button"
                  className="rounded-full bg-[#202b44] px-4 py-2 text-sm font-medium text-white hover:bg-[#27314e]"
                  onClick={() => setCreateLeadOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canSubmitLead || submitting}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
                  onClick={submitNewLead}
                >
                  {submitting ? 'Creating...' : 'Create a lead'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  )
}

