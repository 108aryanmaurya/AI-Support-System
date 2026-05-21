import { supabaseAdmin } from '../../config/supabase.js';
import { hashIngressContent, normalizeIngressContent } from './ingressHeuristics.js';

/**
 * Find a recent customer message with the same content hash for this email.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.customerEmail
 * @param {string} params.message
 * @param {number} params.windowMinutes
 * @param {string} [params.externalMessageId] — email provider id; exact metadata match
 */
export async function findDuplicateInboundMessage({
  organizationId,
  customerEmail,
  message,
  windowMinutes,
  externalMessageId,
}) {
  const email = String(customerEmail ?? '').trim().toLowerCase();
  if (!email) return null;

  if (externalMessageId) {
    const { data: byExt } = await supabaseAdmin
      .from('messages')
      .select('id, conversation_id')
      .eq('organization_id', organizationId)
      .filter('metadata->>external_message_id', 'eq', String(externalMessageId))
      .limit(1)
      .maybeSingle();
    if (byExt?.id) return byExt;
  }

  const normalized = normalizeIngressContent(message);
  if (!normalized) return null;

  const contentHash = hashIngressContent(normalized);
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { data: customer, error: custErr } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('email', email)
    .limit(1)
    .maybeSingle();

  if (custErr || !customer?.id) return null;

  const { data: rows, error } = await supabaseAdmin
    .from('messages')
    .select('id, conversation_id, created_at, conversations!inner(customer_id)')
    .eq('organization_id', organizationId)
    .eq('sender_type', 'customer')
    .eq('conversations.customer_id', customer.id)
    .gte('created_at', since)
    .filter('metadata->>content_hash', 'eq', contentHash)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[ingress] duplicate lookup failed', {
      organization_id: organizationId,
      error: error.message,
    });
    return null;
  }

  const hit = rows?.[0];
  if (!hit?.id) return null;

  return {
    id: hit.id,
    conversation_id: hit.conversation_id,
    content_hash: contentHash,
  };
}

/**
 * Persist content hash on message metadata for future duplicate checks.
 */
export async function stampMessageContentHash({
  organizationId,
  messageId,
  message,
}) {
  const normalized = normalizeIngressContent(message);
  if (!normalized) return;

  const contentHash = hashIngressContent(normalized);

  const { data: row } = await supabaseAdmin
    .from('messages')
    .select('metadata')
    .eq('id', messageId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  const prior = row?.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
  prior.content_hash = contentHash;

  await supabaseAdmin
    .from('messages')
    .update({ metadata: prior })
    .eq('id', messageId)
    .eq('organization_id', organizationId);
}
