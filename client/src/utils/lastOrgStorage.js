const STORAGE_KEY = 'last_org_id'

export function getLastOrgId() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v?.trim() || null
  } catch {
    return null
  }
}

export function setLastOrgId(orgId) {
  if (!orgId || typeof orgId !== 'string') return
  try {
    localStorage.setItem(STORAGE_KEY, orgId.trim())
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearLastOrgId() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
