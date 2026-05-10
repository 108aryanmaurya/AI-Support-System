/**
 * Split pasted invite lists by commas, whitespace, or semicolons (handles newlines).
 * @param {string} raw
 * @returns {string[]}
 */
export function parseInviteEmails(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  return [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]
}
