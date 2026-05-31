const PREFIX = 'org-invite-draft:'

export function inviteDraftKey(orgId) {
  return `${PREFIX}${orgId}`
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeInviteDraftInboxIds(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean)
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
  return []
}

/**
 * @param {string} orgId
 * @param {{ emails: string[], inboxIds?: string[], inboxId?: string | null }} draft
 */
export function saveInviteDraft(orgId, draft) {
  if (!orgId || !Array.isArray(draft?.emails) || draft.emails.length === 0) return
  const inboxIds = normalizeInviteDraftInboxIds(draft.inboxIds ?? draft.inboxId)
  sessionStorage.setItem(
    inviteDraftKey(orgId),
    JSON.stringify({ emails: draft.emails, inboxIds }),
  )
}

/**
 * @param {string} orgId
 * @returns {{ emails: string[], inboxIds: string[] } | null}
 */
export function loadInviteDraft(orgId) {
  if (!orgId) return null
  try {
    const raw = sessionStorage.getItem(inviteDraftKey(orgId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const emails = Array.isArray(parsed?.emails)
      ? parsed.emails.filter((e) => typeof e === 'string' && e.trim())
      : []
    if (emails.length === 0) return null
    const inboxIds = normalizeInviteDraftInboxIds(parsed?.inboxIds ?? parsed?.inboxId)
    return { emails, inboxIds }
  } catch {
    return null
  }
}

/**
 * @param {string[]} selectedInboxIds
 * @param {{ id: string, name: string }[]} inboxes
 */
export function describeInviteInboxTargets(selectedInboxIds, inboxes) {
  const ids = Array.isArray(selectedInboxIds) ? selectedInboxIds : []
  if (ids.length === 0) {
    return inboxes.length === 0 ? 'this workspace only' : 'no team inboxes selected'
  }
  if (ids.length === 1) {
    const ib = inboxes.find((i) => i.id === ids[0])
    return ib?.name ?? '1 team inbox'
  }
  const names = ids
    .map((id) => inboxes.find((i) => i.id === id)?.name)
    .filter(Boolean)
  if (names.length <= 3) return names.join(', ')
  return `${ids.length} team inboxes`
}

/** @param {string} orgId */
export function clearInviteDraft(orgId) {
  if (!orgId) return
  sessionStorage.removeItem(inviteDraftKey(orgId))
}
