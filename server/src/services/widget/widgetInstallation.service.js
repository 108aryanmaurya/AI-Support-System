import {
  mergeWidgetSettings,
  WIDGET_LIMITS,
  isValidWidgetDomain,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { widgetConfig } from '../../config/widget.config.js';
import { HttpError } from '../../utils/httpError.js';
import {
  generateWidgetKey,
  generateWidgetSecret,
  hashWidgetSecret,
  verifyWidgetSecret,
} from '../../utils/widgetCrypto.js';
import { encryptSecret } from '../../utils/secretsCrypto.js';

function normalizeDomains(domains) {
  if (!Array.isArray(domains)) return [];
  const out = [];
  for (const d of domains) {
    if (typeof d !== 'string') continue;
    const h = d.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!h || !isValidWidgetDomain(h)) continue;
    if (!out.includes(h)) out.push(h);
    if (out.length >= WIDGET_LIMITS.maxAllowedDomains) break;
  }
  return out;
}

export async function listWidgetInstallations(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('widget_installations')
    .select(
      'id, organization_id, widget_key, allowed_domains, status, settings, created_at, updated_at, rotated_at',
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) throw new HttpError(500, error.message || 'Failed to list widget installations.');
  return (data ?? []).map((row) => ({
    ...row,
    settings: mergeWidgetSettings(row.settings),
  }));
}

export async function getWidgetInstallationById(organizationId, installationId) {
  const { data, error } = await supabaseAdmin
    .from('widget_installations')
    .select('*')
    .eq('id', installationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load widget installation.');
  if (!data) throw new HttpError(404, 'Widget installation not found.');
  return { ...data, settings: mergeWidgetSettings(data.settings) };
}

export async function getWidgetInstallationByKey(widgetKey) {
  const key = typeof widgetKey === 'string' ? widgetKey.trim() : '';
  if (!key) return null;

  const { data, error } = await supabaseAdmin
    .from('widget_installations')
    .select('*')
    .eq('widget_key', key)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load widget installation.');
  if (!data) return null;
  return { ...data, settings: mergeWidgetSettings(data.settings) };
}

export async function createWidgetInstallation({
  organizationId,
  allowedDomains = [],
  settings = {},
  testMode = false,
}) {
  const { count, error: countErr } = await supabaseAdmin
    .from('widget_installations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  if (countErr) throw new HttpError(500, countErr.message || 'Failed to count installations.');
  if ((count ?? 0) >= WIDGET_LIMITS.maxInstallationsPerOrg) {
    throw new HttpError(400, `Maximum ${WIDGET_LIMITS.maxInstallationsPerOrg} widget installations per organization.`);
  }

  const domains = normalizeDomains(allowedDomains);
  const secret = generateWidgetSecret();
  const widget_key = generateWidgetKey(testMode);

  let secret_encrypted = null;
  try {
    secret_encrypted = encryptSecret(secret);
  } catch {
    secret_encrypted = null;
  }

  const { data, error } = await supabaseAdmin
    .from('widget_installations')
    .insert({
      organization_id: organizationId,
      widget_key,
      secret_hash: hashWidgetSecret(secret),
      secret_encrypted,
      allowed_domains: domains,
      status: 'active',
      settings: mergeWidgetSettings(settings),
    })
    .select(
      'id, organization_id, widget_key, allowed_domains, status, settings, created_at, updated_at',
    )
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to create widget installation.');

  return {
    installation: { ...data, settings: mergeWidgetSettings(data.settings) },
    secret,
  };
}

export async function patchWidgetInstallation({
  organizationId,
  installationId,
  allowedDomains,
  settings,
  status,
}) {
  const existing = await getWidgetInstallationById(organizationId, installationId);

  const patch = { updated_at: new Date().toISOString() };
  if (allowedDomains !== undefined) {
    patch.allowed_domains = normalizeDomains(allowedDomains);
  }
  if (settings !== undefined) {
    patch.settings = mergeWidgetSettings({ ...existing.settings, ...settings });
  }
  if (status === 'active' || status === 'disabled') {
    patch.status = status;
  }

  const { data, error } = await supabaseAdmin
    .from('widget_installations')
    .update(patch)
    .eq('id', installationId)
    .eq('organization_id', organizationId)
    .select(
      'id, organization_id, widget_key, allowed_domains, status, settings, created_at, updated_at, rotated_at',
    )
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to update widget installation.');
  return { ...data, settings: mergeWidgetSettings(data.settings) };
}

export async function rotateWidgetInstallationSecret({
  organizationId,
  installationId,
  revokeSessions = false,
}) {
  const row = await getWidgetInstallationById(organizationId, installationId);
  const secret = generateWidgetSecret();
  const secret_hash = hashWidgetSecret(secret);
  let secret_encrypted = null;
  try {
    secret_encrypted = encryptSecret(secret);
  } catch {
    secret_encrypted = null;
  }

  const { data, error } = await supabaseAdmin
    .from('widget_installations')
    .update({
      secret_hash,
      secret_encrypted,
      rotated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', installationId)
    .eq('organization_id', organizationId)
    .select('id, widget_key, rotated_at')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to rotate widget secret.');

  if (revokeSessions) {
    const { data: visitors } = await supabaseAdmin
      .from('widget_visitors')
      .select('id')
      .eq('installation_id', installationId);

    const visitorIds = (visitors ?? []).map((v) => v.id);
    if (visitorIds.length) {
      await supabaseAdmin
        .from('widget_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .in('visitor_id', visitorIds)
        .is('revoked_at', null);
    }
  }

  return { installationId: data.id, widgetKey: row.widget_key, secret };
}

export function buildWidgetSnippet(widgetKey) {
  const src = `${widgetConfig.cdnOrigin}/v1/widget.js`;
  return `<script async src="${src}" data-widget-key="${widgetKey}"></script>`;
}

export function verifyInstallationSecret(installation, secret) {
  return verifyWidgetSecret(secret, installation.secret_hash);
}
