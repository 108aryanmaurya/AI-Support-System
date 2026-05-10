const STORAGE_KEY = 'pending_invite_token'

export function getPendingInviteToken() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v?.trim() || null
  } catch {
    return null
  }
}

export function setPendingInviteToken(token) {
  if (!token || typeof token !== 'string') return
  try {
    localStorage.setItem(STORAGE_KEY, token.trim())
  } catch {
    /* ignore */
  }
}

export function clearPendingInviteToken() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
