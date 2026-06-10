const STORAGE_PREFIX = 'aisearch:saved:';

/**
 * @param {string} organizationId
 * @returns {string}
 */
function storageKey(organizationId) {
  return `${STORAGE_PREFIX}${organizationId}`;
}

/**
 * @typedef {object} SavedSearch
 * @property {string} id
 * @property {string} name
 * @property {Record<string, unknown>} payload
 * @property {string} savedAt
 */

/**
 * @param {string} organizationId
 * @returns {SavedSearch[]}
 */
export function listSavedSearches(organizationId) {
  if (!organizationId) return [];
  try {
    const raw = localStorage.getItem(storageKey(organizationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} organizationId
 * @param {SavedSearch[]} items
 */
function writeSavedSearches(organizationId, items) {
  localStorage.setItem(storageKey(organizationId), JSON.stringify(items.slice(0, 12)));
}

/**
 * @param {string} organizationId
 * @param {string} name
 * @param {Record<string, unknown>} payload
 */
export function saveSearch(organizationId, name, payload) {
  const trimmed = typeof name === 'string' ? name.trim().slice(0, 64) : '';
  if (!organizationId || !trimmed) return null;
  const items = listSavedSearches(organizationId);
  const entry = {
    id: crypto.randomUUID(),
    name: trimmed,
    payload,
    savedAt: new Date().toISOString(),
  };
  writeSavedSearches(organizationId, [entry, ...items.filter((s) => s.name !== trimmed)]);
  return entry;
}

/**
 * @param {string} organizationId
 * @param {string} id
 */
export function deleteSavedSearch(organizationId, id) {
  const items = listSavedSearches(organizationId).filter((s) => s.id !== id);
  writeSavedSearches(organizationId, items);
}
