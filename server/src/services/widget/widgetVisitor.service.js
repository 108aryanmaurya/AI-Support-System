import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { generateVisitorToken, hashIp } from '../../utils/widgetCrypto.js';

export async function findOrCreateVisitor({
  installation,
  visitorToken: existingToken,
  ip,
}) {
  const token =
    typeof existingToken === 'string' && existingToken.trim().length >= 16
      ? existingToken.trim()
      : generateVisitorToken();

  const { data: existing, error: findErr } = await supabaseAdmin
    .from('widget_visitors')
    .select('*')
    .eq('installation_id', installation.id)
    .eq('visitor_token', token)
    .maybeSingle();

  if (findErr) throw new HttpError(500, findErr.message || 'Failed to load visitor.');

  const ipHash = hashIp(ip);
  const now = new Date().toISOString();

  if (existing) {
    await supabaseAdmin
      .from('widget_visitors')
      .update({ last_seen_at: now, last_ip_hash: ipHash })
      .eq('id', existing.id);
    return { visitor: existing, visitorToken: token, created: false };
  }

  const { data: created, error: createErr } = await supabaseAdmin
    .from('widget_visitors')
    .insert({
      organization_id: installation.organization_id,
      installation_id: installation.id,
      visitor_token: token,
      last_ip_hash: ipHash,
    })
    .select('*')
    .single();

  if (createErr) throw new HttpError(500, createErr.message || 'Failed to create visitor.');
  return { visitor: created, visitorToken: token, created: true };
}

export async function linkVisitorToCustomer(visitorId, customerId, { email, name } = {}) {
  const patch = {
    customer_id: customerId,
    last_seen_at: new Date().toISOString(),
  };
  if (email) patch.email = email.trim().toLowerCase();
  if (name) patch.name = name.trim();

  const { data, error } = await supabaseAdmin
    .from('widget_visitors')
    .update(patch)
    .eq('id', visitorId)
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to link visitor to customer.');
  return data;
}

export async function getVisitorById(visitorId) {
  const { data, error } = await supabaseAdmin
    .from('widget_visitors')
    .select('*')
    .eq('id', visitorId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load visitor.');
  return data;
}
