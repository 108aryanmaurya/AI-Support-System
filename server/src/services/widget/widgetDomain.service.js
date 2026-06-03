import { isValidWidgetDomain } from '@ai-support/shared';
import { widgetConfig } from '../../config/widget.config.js';

/**
 * @param {string | undefined} originHeader
 * @param {string | undefined} refererHeader
 * @returns {string|null} hostname
 */
export function parseRequestHostname(originHeader, refererHeader) {
  const tryUrl = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    try {
      return new URL(raw.trim()).hostname.toLowerCase();
    } catch {
      return null;
    }
  };
  return tryUrl(originHeader) || tryUrl(refererHeader);
}

/**
 * @param {string[]} allowedDomains
 * @param {string|null} hostname
 */
export function isDomainAllowed(allowedDomains, hostname) {
  if (widgetConfig.devSkipDomainCheck) return true;
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  const list = Array.isArray(allowedDomains) ? allowedDomains : [];
  if (list.length === 0) return false;
  for (const entry of list) {
    const domain = typeof entry === 'string' ? entry.trim().toLowerCase() : '';
    if (!domain || !isValidWidgetDomain(domain)) continue;
    if (host === domain) return true;
    if (domain.startsWith('*.') && host.endsWith(domain.slice(1))) return true;
  }
  return false;
}
