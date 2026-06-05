/** @typedef {'bottom-right' | 'bottom-left'} WidgetPosition */

export const WIDGET_KEY_PREFIX_LIVE = 'wk_live_';
export const WIDGET_KEY_PREFIX_TEST = 'wk_test_';
export const WIDGET_SECRET_PREFIX = 'wks_';

export const WIDGET_LIMITS = Object.freeze({
  maxInstallationsPerOrg: 10,
  maxAllowedDomains: 50,
  maxDomainLength: 253,
  maxGreetingLength: 500,
  maxSettingsJsonBytes: 16_384,
});

export const DEFAULT_WIDGET_SETTINGS = Object.freeze({
  brandColor: '#2563eb',
  logoUrl: null,
  position: 'bottom-right',
  launcherIcon: 'chat',
  darkMode: false,
  greeting: 'Hi! How can we help?',
  autoOpen: false,
  requireEmail: true,
  preChatFields: Object.freeze(['email', 'name']),
  showConversationList: false,
  businessHours: null,
  offlineMessage: 'We are away. Leave a message and we will get back to you.',
  privacyUrl: null,
  identifyRequireHmac: false,
  identifyAllowInsecure: false,
  attachmentMaxBytes: 5_242_880,
  captchaEnabled: false,
  /** Visitors: allow starting new widget conversations. */
  visitorsAllowStartConversation: true,
  visitorsPreventMultipleConversations: false,
  visitorsRequireSearchBeforeStart: false,
  visitorsAllowStartAfterHelpReaction: true,
  visitorsPreventReplyClosedConversations: false,
  visitorsPreventReplyClosedTickets: false,
  /** Identified users (JWT / identify). */
  usersAllowStartConversation: true,
  usersPreventMultipleConversations: false,
  usersRequireSearchBeforeStart: false,
  usersAllowStartAfterHelpReaction: false,
  usersPreventReplyClosedConversations: false,
  usersPreventReplyClosedTickets: false,
});

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function mergeWidgetSettings(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const merged = { ...DEFAULT_WIDGET_SETTINGS };
  for (const key of Object.keys(DEFAULT_WIDGET_SETTINGS)) {
    if (src[key] !== undefined && src[key] !== null) {
      merged[key] = src[key];
    }
  }
  if (merged.position !== 'bottom-left' && merged.position !== 'bottom-right') {
    merged.position = DEFAULT_WIDGET_SETTINGS.position;
  }
  return merged;
}

/**
 * @param {string} hostname
 */
export function isValidWidgetDomain(hostname) {
  if (typeof hostname !== 'string') return false;
  const h = hostname.trim().toLowerCase();
  if (!h || h.length > WIDGET_LIMITS.maxDomainLength) return false;
  if (h.includes('/') || h.includes(':')) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(h) || h === 'localhost';
}
