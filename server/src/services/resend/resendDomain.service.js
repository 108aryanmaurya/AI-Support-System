import { resendFetch } from './resendHttp.service.js';

/**
 * @param {unknown} record
 */
export function mapDnsRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (record);
  return {
    record: typeof r.record === 'string' ? r.record : '',
    name: typeof r.name === 'string' ? r.name : '',
    type: typeof r.type === 'string' ? r.type : '',
    value: typeof r.value === 'string' ? r.value : '',
    priority: typeof r.priority === 'number' ? r.priority : null,
    ttl: typeof r.ttl === 'string' ? r.ttl : '',
    status: typeof r.status === 'string' ? r.status : '',
  };
}

/**
 * @param {unknown} body
 */
export function normalizeDomainResponse(body) {
  const root = body && typeof body === 'object' ? body : {};
  const data =
    root.data && typeof root.data === 'object'
      ? root.data
      : root;

  const d = /** @type {Record<string, unknown>} */ (data);
  const recordsRaw = Array.isArray(d.records) ? d.records : [];
  const records = recordsRaw.map(mapDnsRecord).filter(Boolean);

  const capabilities =
    d.capabilities && typeof d.capabilities === 'object'
      ? d.capabilities
      : { sending: 'enabled', receiving: 'disabled' };

  return {
    id: typeof d.id === 'string' ? d.id : '',
    name: typeof d.name === 'string' ? d.name : '',
    status: typeof d.status === 'string' ? d.status : 'not_started',
    region: typeof d.region === 'string' ? d.region : null,
    capabilities,
    records,
  };
}

/**
 * @param {string} subdomain e.g. support.acme.com
 * @param {{ enableReceiving?: boolean }} [options]
 */
export async function createResendDomain(subdomain, options = {}) {
  const enableReceiving = options.enableReceiving !== false;
  const body = await resendFetch('/domains', {
    method: 'POST',
    body: {
      name: subdomain,
      capabilities: {
        sending: 'enabled',
        receiving: enableReceiving ? 'enabled' : 'disabled',
      },
    },
  });
  return normalizeDomainResponse(body);
}

/** DNS rows needed for outbound (SPF/DKIM/DMARC) — exclude inbound MX when forwarding receive path. */
export function filterSendingDnsRecords(records) {
  return (records ?? []).filter((r) => {
    const kind = String(r?.record || '').toLowerCase();
    if (kind === 'receiving') return false;
    if (String(r?.type || '').toUpperCase() === 'MX' && kind !== 'spf') return false;
    return true;
  });
}

/**
 * @param {string} domainId
 */
export async function getResendDomain(domainId) {
  const body = await resendFetch(`/domains/${encodeURIComponent(domainId)}`);
  return normalizeDomainResponse(body);
}

/**
 * @param {string} domainId
 */
export async function verifyResendDomain(domainId) {
  const body = await resendFetch(`/domains/${encodeURIComponent(domainId)}/verify`, {
    method: 'POST',
    body: {},
  });
  return normalizeDomainResponse(body);
}

/**
 * @param {{ domainId: string, orgLabel: string }} params
 */
export async function createDomainScopedApiKey({ domainId, orgLabel }) {
  const safeLabel = String(orgLabel || 'tenant')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 40);
  const body = await resendFetch('/api-keys', {
    method: 'POST',
    body: {
      name: `Org: ${safeLabel}`.slice(0, 50),
      permission: 'sending_access',
      domain_id: domainId,
    },
  });

  const root = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : {};
  const data =
    root.data && typeof root.data === 'object'
      ? /** @type {Record<string, unknown>} */ (root.data)
      : root;
  const row = /** @type {Record<string, unknown>} */ (data);

  return {
    id: typeof row.id === 'string' ? row.id : '',
    token:
      typeof row.token === 'string'
        ? row.token
        : typeof root.token === 'string'
          ? root.token
          : '',
  };
}

/**
 * Map Resend domain status to org_email_domains.status
 * @param {string} resendStatus
 * @param {Array<{ status?: string }>} records
 */
export function mapResendStatusToOrgStatus(resendStatus, records = []) {
  const norm = String(resendStatus || '').toLowerCase();
  if (norm === 'verified') return 'verified';

  const allRecordsVerified =
    records.length > 0 && records.every((r) => String(r?.status || '').toLowerCase() === 'verified');
  if (allRecordsVerified) return 'verified';

  if (norm === 'failed' || norm === 'temporary_failure') return 'failed';
  return 'pending';
}
