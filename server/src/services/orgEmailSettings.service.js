import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { encryptSecret, decryptSecret } from '../utils/secretsCrypto.js';
import {
  createResendDomain,
  createDomainScopedApiKey,
  filterSendingDnsRecords,
  getResendDomain,
  mapResendStatusToOrgStatus,
  verifyResendDomain,
} from './resend/resendDomain.service.js';

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const LOCAL_PART_RE = /^[a-z0-9]([a-z0-9._+-]*[a-z0-9])?$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeSubdomain(input) {
  if (typeof input !== 'string') {
    throw new HttpError(400, 'subdomain is required.');
  }
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/\/.*$/, '');
  if (!s || s.length > 253 || !SUBDOMAIN_RE.test(s)) {
    throw new HttpError(400, 'Enter a valid subdomain (e.g. support.yourcompany.com).');
  }
  return s;
}

function normalizeLocalPart(input, field) {
  const s = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!s || s.length > 64 || !LOCAL_PART_RE.test(s)) {
    throw new HttpError(400, `${field} must be a valid email local-part.`);
  }
  return s;
}

function normalizeDisplayEmail(input) {
  if (input == null || input === '') return null;
  const s = String(input).trim().toLowerCase();
  if (!EMAIL_RE.test(s)) {
    throw new HttpError(400, 'displaySupportEmail must be a valid email address.');
  }
  return s;
}

function emailOnSubdomain(localPart, subdomain) {
  return `${localPart}@${subdomain}`;
}

function parseLocalFromFull(email, subdomain) {
  const norm = String(email || '').trim().toLowerCase();
  const suffix = `@${subdomain}`;
  if (!norm.endsWith(suffix)) return null;
  return norm.slice(0, -suffix.length);
}

/**
 * @returns {{ type: 'fixed', email: string } | { type: 'generated', domain: string }}
 */
function getInboundForwardConfig() {
  const candidates = [env.resendInboundAddress, env.resendInboundDomain].filter(Boolean);
  const raw = candidates[0]?.trim().toLowerCase() ?? '';
  if (!raw) {
    throw new HttpError(
      503,
      'Inbound email forwarding is not configured (set RESEND_INBOUND_ADDRESS or RESEND_INBOUND_DOMAIN).',
    );
  }

  if (raw.includes('@')) {
    const email = raw.replace(/^@+/, '');
    if (!EMAIL_RE.test(email)) {
      throw new HttpError(503, 'RESEND_INBOUND_ADDRESS must be a valid email (e.g. support@wemelovora.resend.app).');
    }
    return { type: 'fixed', email };
  }

  const domain = raw.replace(/^@+/, '');
  return { type: 'generated', domain };
}

function generateForwardAddress(organizationId) {
  const cfg = getInboundForwardConfig();
  if (cfg.type === 'fixed') {
    return cfg.email;
  }
  const compact = organizationId.replace(/-/g, '').slice(0, 12);
  const suffix = crypto.randomBytes(4).toString('hex');
  return `org.${compact}.${suffix}@${cfg.domain}`;
}

function isForwardingMode(row) {
  return String(row?.setup_mode || 'forwarding').toLowerCase() === 'forwarding';
}

/**
 * @param {Record<string, unknown>|null} row
 */
export function toPublicEmailSettings(row) {
  if (!row) {
    return {
      configured: false,
      setupMode: 'forwarding',
      subdomain: null,
      status: null,
      capabilities: null,
      dnsRecords: [],
      outboundFromEmail: null,
      inboundAddress: null,
      displaySupportEmail: null,
      channelId: null,
      sendingReady: false,
      receivingReady: false,
      forwardingReady: false,
      sendingDomainStarted: false,
    };
  }

  const setupMode = isForwardingMode(row) ? 'forwarding' : 'dns';
  const subdomain = row.subdomain ?? null;
  const allRecords = Array.isArray(row.dns_records) ? row.dns_records : [];
  const dnsRecords =
    setupMode === 'forwarding' ? filterSendingDnsRecords(allRecords) : allRecords;
  const capabilities = row.capabilities && typeof row.capabilities === 'object' ? row.capabilities : {};

  const sendingReady = row.status === 'verified';
  const forwardingReady = Boolean(row.forwarding_verified_at);
  const receivingRecord = allRecords.find((r) => String(r?.record || '').toLowerCase() === 'receiving');

  let receivingReady = false;
  if (setupMode === 'forwarding') {
    receivingReady = forwardingReady && Boolean(row.inbound_address);
  } else {
    receivingReady =
      sendingReady &&
      (!receivingRecord || String(receivingRecord.status || '').toLowerCase() === 'verified');
  }

  return {
    configured: true,
    setupMode,
    subdomain,
    status: row.status ?? 'pending',
    capabilities,
    dnsRecords,
    outboundFromEmail: row.outbound_from_email ?? null,
    inboundAddress: row.inbound_address ?? null,
    displaySupportEmail: row.display_support_email ?? null,
    channelId: row.channel_id ?? null,
    sendingReady,
    receivingReady,
    forwardingReady,
    sendingDomainStarted: Boolean(row.resend_domain_id),
  };
}

function enrichPublicRow(row, publicRow) {
  if (!row?.subdomain) return publicRow;
  return {
    ...publicRow,
    outboundLocalPart: parseLocalFromFull(publicRow.outboundFromEmail, row.subdomain),
    inboundLocalPart: parseLocalFromFull(publicRow.inboundAddress, row.subdomain),
  };
}

async function loadOrgEmailDomain(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organization_email_domains')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();
console.log('data', data)
  if (error) {
    throw new HttpError(500, error.message || 'Failed to load email domain settings.');
  }
  return data;
}

async function syncFromResend(row) {
  if (!row.resend_domain_id) return row;
  const remote = await getResendDomain(row.resend_domain_id);
  const status = mapResendStatusToOrgStatus(remote.status, remote.records);
  const records =
    isForwardingMode(row) ? filterSendingDnsRecords(remote.records) : remote.records;

  const { data, error } = await supabaseAdmin
    .from('organization_email_domains')
    .update({
      status,
      capabilities: remote.capabilities ?? {},
      dns_records: records ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to update domain status.');
  return data;
}

async function upsertChannelIntegration(channelId, config) {
  const { data: existingIntegration } = await supabaseAdmin
    .from('channel_integrations')
    .select('id')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingIntegration?.id) {
    const { error: upErr } = await supabaseAdmin
      .from('channel_integrations')
      .update({ provider: 'resend', config })
      .eq('id', existingIntegration.id);
    if (upErr) throw new HttpError(500, upErr.message || 'Failed to update channel integration.');
  } else {
    const { error: insErr } = await supabaseAdmin.from('channel_integrations').insert({
      channel_id: channelId,
      provider: 'resend',
      config,
    });
    if (insErr) throw new HttpError(500, insErr.message || 'Failed to create channel integration.');
  }
}

async function ensureEmailChannel(organizationId, row) {
  let channelId = row.channel_id;
  if (!channelId) {
    const { data: channel, error: chErr } = await supabaseAdmin
      .from('channels')
      .insert({
        organization_id: organizationId,
        type: 'email',
        name: 'Email support',
        is_active: true,
      })
      .select('id')
      .single();

    if (chErr) throw new HttpError(500, chErr.message || 'Failed to create email channel.');
    channelId = channel.id;
  } else {
    await supabaseAdmin.from('channels').update({ is_active: true }).eq('id', channelId);
  }
  return channelId;
}

/**
 * Inbound-only channel (forwarding path) — outbound uses domain key after send DNS verify.
 */
async function provisionForwardingChannel(organizationId, row) {
  const inbound = row.inbound_address;
  if (!inbound) {
    throw new HttpError(400, 'Inbound forward address is missing.');
  }

  const channelId = await ensureEmailChannel(organizationId, row);

  const config = {
    setup_mode: 'forwarding',
    inbound_email: inbound,
    to_email: inbound,
    display_support_email: row.display_support_email ?? null,
    sending_verified: row.status === 'verified',
    from_email: row.outbound_from_email ?? '',
    domain: row.subdomain ?? '',
    support_email: row.outbound_from_email ?? row.display_support_email ?? '',
  };

  await upsertChannelIntegration(channelId, config);

  const { data: updated, error } = await supabaseAdmin
    .from('organization_email_domains')
    .update({
      channel_id: channelId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to save forwarding channel.');
  return updated;
}

/** Full provision after sending domain verified (domain-scoped API key). */
async function provisionSendingChannel(organizationId, row) {
  if (row.status !== 'verified' || !row.resend_domain_id || !row.subdomain) {
    return row;
  }

  const subdomain = row.subdomain;
  const outbound =
    row.outbound_from_email || emailOnSubdomain('support', subdomain);
  const inbound = row.inbound_address || generateForwardAddress(organizationId);

  let apiKeyPlain = '';
  if (row.resend_api_key_encrypted) {
    try {
      apiKeyPlain = decryptSecret(row.resend_api_key_encrypted);
    } catch {
      apiKeyPlain = '';
    }
  }

  let apiKeyId = row.resend_api_key_id ?? null;
  if (!apiKeyPlain) {
    const created = await createDomainScopedApiKey({
      domainId: row.resend_domain_id,
      orgLabel: subdomain,
    });
    if (!created.token) {
      throw new HttpError(502, 'Resend did not return an API key token.');
    }
    apiKeyPlain = created.token;
    apiKeyId = created.id || apiKeyId;
  }

  const encryptedKey = encryptSecret(apiKeyPlain);
  const channelId = await ensureEmailChannel(organizationId, row);

  const config = {
    api_key: encryptedKey,
    setup_mode: row.setup_mode ?? 'forwarding',
    from_email: outbound,
    inbound_email: inbound,
    to_email: inbound,
    domain: subdomain,
    support_email: outbound,
    display_support_email: row.display_support_email ?? null,
    sending_verified: true,
  };

  await upsertChannelIntegration(channelId, config);

  const { data: updated, error } = await supabaseAdmin
    .from('organization_email_domains')
    .update({
      channel_id: channelId,
      outbound_from_email: outbound,
      inbound_address: inbound,
      resend_api_key_id: apiKeyId,
      resend_api_key_encrypted: encryptedKey,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to save email channel provisioning.');
  return updated;
}

export async function getOrgEmailSettings(organizationId) {
  const row = await loadOrgEmailDomain(organizationId);
  return enrichPublicRow(row, toPublicEmailSettings(row));
}

/** Intercom-style: allocate platform forward address (no customer inbound DNS). */
export async function startOrgEmailForwarding(organizationId, { displaySupportEmail }) {
  const displayEmail = normalizeDisplayEmail(displaySupportEmail);
  const existing = await loadOrgEmailDomain(organizationId);

  if (existing && !isForwardingMode(existing)) {
    throw new HttpError(
      409,
      'This workspace uses direct DNS email setup. Disconnect before switching to forwarding.',
    );
  }

  const forwardAddress = existing?.inbound_address || generateForwardAddress(organizationId);

  const { data, error } = await supabaseAdmin
    .from('organization_email_domains')
    .upsert(
      {
        organization_id: organizationId,
        setup_mode: 'forwarding',
        inbound_address: forwardAddress,
        display_support_email: displayEmail,
        status: existing?.status && existing.status !== 'verified' ? existing.status : 'pending',
        resend_domain_id: existing?.resend_domain_id ?? null,
        subdomain: existing?.subdomain ?? null,
        dns_records: existing?.dns_records ?? [],
        capabilities: existing?.capabilities ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' },
    )
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to save forwarding setup.');

  let row = data;
  row = await provisionForwardingChannel(organizationId, row);

  return enrichPublicRow(row, toPublicEmailSettings(row));
}

export async function confirmOrgEmailForwarding(organizationId) {
  const row = await loadOrgEmailDomain(organizationId);
  if (!row || !isForwardingMode(row)) {
    throw new HttpError(404, 'Set up email forwarding first.');
  }
  if (!row.inbound_address) {
    throw new HttpError(400, 'Forward address is not configured.');
  }

  const { data, error } = await supabaseAdmin
    .from('organization_email_domains')
    .update({
      forwarding_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to confirm forwarding.');

  let result = await provisionForwardingChannel(organizationId, data);
  if (result.status === 'verified') {
    result = await provisionSendingChannel(organizationId, result);
  }

  return enrichPublicRow(result, toPublicEmailSettings(result));
}

/** Sending domain DNS (SPF/DKIM only when forwarding mode). */
export async function startOrgEmailSendingDomain(organizationId, { subdomain: subdomainInput }) {
  const subdomain = normalizeSubdomain(subdomainInput);
  const existing = await loadOrgEmailDomain(organizationId);

  if (existing?.subdomain && existing.subdomain !== subdomain) {
    throw new HttpError(
      409,
      'A different sending subdomain is already configured. Disconnect before changing it.',
    );
  }

  if (existing?.resend_domain_id) {
    const synced = await syncFromResend(existing);
    return enrichPublicRow(synced, toPublicEmailSettings(synced));
  }

  const useForwardingInbound = !existing || isForwardingMode(existing);
  const remote = await createResendDomain(subdomain, { enableReceiving: !useForwardingInbound });
  if (!remote.id) {
    throw new HttpError(502, 'Resend did not return a domain id.');
  }

  const status = mapResendStatusToOrgStatus(remote.status, remote.records);
  const records = isForwardingMode(existing ?? { setup_mode: 'forwarding' })
    ? filterSendingDnsRecords(remote.records)
    : remote.records;

  const forwardAddress = existing?.inbound_address || generateForwardAddress(organizationId);

  const { data, error } = await supabaseAdmin
    .from('organization_email_domains')
    .upsert(
      {
        organization_id: organizationId,
        setup_mode: existing?.setup_mode ?? 'forwarding',
        resend_domain_id: remote.id,
        subdomain,
        status,
        capabilities: remote.capabilities ?? {},
        dns_records: records ?? [],
        inbound_address: forwardAddress,
        outbound_from_email: emailOnSubdomain('support', subdomain),
        display_support_email: existing?.display_support_email ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' },
    )
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to save sending domain.');

  let row = data;
  if (isForwardingMode(row)) {
    row = await provisionForwardingChannel(organizationId, row);
  }

  return enrichPublicRow(row, toPublicEmailSettings(row));
}

/** Legacy full DNS path (send + receive on customer subdomain). */
export async function startOrgEmailDomainSetup(organizationId, { subdomain: subdomainInput }) {
  const subdomain = normalizeSubdomain(subdomainInput);
  const existing = await loadOrgEmailDomain(organizationId);

  if (existing && isForwardingMode(existing) && existing.inbound_address) {
    throw new HttpError(
      409,
      'Forwarding is already configured. Use sending-domain setup or disconnect first.',
    );
  }

  if (existing?.resend_domain_id) {
    const synced = await syncFromResend({ ...existing, setup_mode: 'dns' });
    return enrichPublicRow(synced, toPublicEmailSettings(synced));
  }

  const remote = await createResendDomain(subdomain, { enableReceiving: true });
  if (!remote.id) {
    throw new HttpError(502, 'Resend did not return a domain id.');
  }

  const status = mapResendStatusToOrgStatus(remote.status, remote.records);

  const { data, error } = await supabaseAdmin
    .from('organization_email_domains')
    .upsert(
      {
        organization_id: organizationId,
        setup_mode: 'dns',
        resend_domain_id: remote.id,
        subdomain,
        status,
        capabilities: remote.capabilities ?? {},
        dns_records: remote.records ?? [],
        outbound_from_email: emailOnSubdomain('support', subdomain),
        inbound_address: emailOnSubdomain('help', subdomain),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' },
    )
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to save email domain.');
  return enrichPublicRow(data, toPublicEmailSettings(data));
}

export async function verifyOrgEmailDomain(organizationId) {
  const row = await loadOrgEmailDomain(organizationId);
  if (!row?.resend_domain_id) {
    throw new HttpError(404, 'Configure a sending subdomain before verifying DNS.');
  }

  await verifyResendDomain(row.resend_domain_id);
  let synced = await syncFromResend(row);

  if (synced.status === 'verified') {
    if (isForwardingMode(synced)) {
      synced = await provisionSendingChannel(organizationId, synced);
    } else {
      synced = await provisionSendingChannel(organizationId, synced);
    }
  } else if (isForwardingMode(synced)) {
    synced = await provisionForwardingChannel(organizationId, synced);
  }

  return enrichPublicRow(synced, toPublicEmailSettings(synced));
}

export async function patchOrgEmailAddresses(organizationId, body) {
  const row = await loadOrgEmailDomain(organizationId);
  if (!row) {
    throw new HttpError(404, 'Configure email forwarding or a subdomain before setting addresses.');
  }

  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, 'displaySupportEmail')) {
    patch.display_support_email = normalizeDisplayEmail(body.displaySupportEmail);
  }

  if (row.subdomain) {
    const subdomain = row.subdomain;
    if (Object.prototype.hasOwnProperty.call(body, 'outboundLocalPart')) {
      const local = normalizeLocalPart(body.outboundLocalPart, 'outboundLocalPart');
      patch.outbound_from_email = emailOnSubdomain(local, subdomain);
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'inboundLocalPart') &&
      !isForwardingMode(row)
    ) {
      const local = normalizeLocalPart(body.inboundLocalPart, 'inboundLocalPart');
      patch.inbound_address = emailOnSubdomain(local, subdomain);
    }
  }

  if (!Object.keys(patch).length) {
    throw new HttpError(400, 'No address fields to update.');
  }

  const { data, error } = await supabaseAdmin
    .from('organization_email_domains')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to update addresses.');

  let result = data;
  if (result.status === 'verified') {
    result = await provisionSendingChannel(organizationId, result);
  } else if (isForwardingMode(result)) {
    result = await provisionForwardingChannel(organizationId, result);
  }

  return enrichPublicRow(result, toPublicEmailSettings(result));
}

export async function deleteOrgEmailSettings(organizationId) {
  const row = await loadOrgEmailDomain(organizationId);
  if (!row) return { ok: true };

  if (row.channel_id) {
    await supabaseAdmin.from('channels').update({ is_active: false }).eq('id', row.channel_id);
  }

  const { error } = await supabaseAdmin
    .from('organization_email_domains')
    .delete()
    .eq('organization_id', organizationId);

  if (error) throw new HttpError(500, error.message || 'Failed to remove email domain settings.');
  return { ok: true };
}

export async function handleResendDomainWebhook(resendDomainId) {
  if (!resendDomainId) return;

  const { data: row, error } = await supabaseAdmin
    .from('organization_email_domains')
    .select('*')
    .eq('resend_domain_id', resendDomainId)
    .maybeSingle();

  if (error) {
    console.error('[resend-webhook] load organization_email_domains failed', {
      resend_domain_id: resendDomainId,
      message: error.message,
    });
    return;
  }
  if (!row) return;

  let synced = await syncFromResend(row);
  if (synced.status === 'verified') {
    synced = await provisionSendingChannel(row.organization_id, synced);
  } else if (isForwardingMode(synced)) {
    synced = await provisionForwardingChannel(row.organization_id, synced);
  }
}
