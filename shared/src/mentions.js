/** @typedef {{ userId: string, displayName?: string | null, email?: string | null }} MentionMemberInput */

/**
 * Collect @handles from message text (includes duplicate occurrences).
 * @param {string} content
 * @returns {string[]}
 */
export function extractMentionHandles(content) {
  if (typeof content !== 'string' || !content) return []
  return [...content.matchAll(/@([\w.-]+)/g)].map((m) => m[1]?.toLowerCase()).filter(Boolean)
}

/**
 * Handles used to match @mentions for one member.
 * @param {MentionMemberInput} member
 * @returns {Set<string>}
 */
export function mentionHandlesForMember(member) {
  const handles = new Set()
  const email = typeof member.email === 'string' ? member.email.trim().toLowerCase() : ''
  if (email.includes('@')) {
    const local = email.split('@')[0]
    if (local) handles.add(local)
  }
  const rawName = typeof member.displayName === 'string' ? member.displayName.trim() : ''
  if (rawName) {
    handles.add(rawName.toLowerCase().replace(/\s+/g, ''))
    const parts = rawName.split(/\s+/).filter(Boolean)
    if (parts[0]) handles.add(parts[0].toLowerCase())
    if (parts.length > 1) handles.add(parts[parts.length - 1].toLowerCase())
  }
  return handles
}

/**
 * Map @handles in content to unique user ids (stable order).
 * @param {string} content
 * @param {MentionMemberInput[]} members
 * @returns {string[]}
 */
export function resolveMentionUserIdsFromContent(content, members) {
  const handles = extractMentionHandles(content)
  if (!handles.length || !Array.isArray(members)) return []

  const byHandle = new Map()
  for (const m of members) {
    if (!m?.userId) continue
    for (const h of mentionHandlesForMember(m)) {
      if (!byHandle.has(h)) byHandle.set(h, m.userId)
    }
  }

  const seen = new Set()
  const ids = []
  for (const h of handles) {
    const uid = byHandle.get(h)
    if (uid && !seen.has(uid)) {
      seen.add(uid)
      ids.push(uid)
    }
  }
  return ids
}
