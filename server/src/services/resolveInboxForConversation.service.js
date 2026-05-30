import { mergeInboxSettings } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { getDefaultInboxId } from './inboxDefault.service.js';
import {
  loadOrgAssignmentRouting,
  resolveTargetInbox,
  scoreInboxRule,
} from './assignment/assignmentInbox.service.js';

/**
 * Deterministic inbox resolution for new/updated conversations.
 * Order: workflow override → DB inbox settings (channels/intents/tags) → assignment JSON routing → default.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {object} [params.conversation]
 * @param {string | null} [params.channelType]
 * @param {string | null} [params.intent]
 * @param {string[]} [params.tagNames]
 * @param {string | null} [params.overrideInboxId]
 */
export async function resolveInboxForConversation({
  organizationId,
  conversation = null,
  channelType = null,
  intent = null,
  tagNames = [],
  overrideInboxId = null,
}) {
  if (overrideInboxId) {
    const valid = await validateActiveInbox(organizationId, overrideInboxId);
    if (valid) {
      return { inboxId: overrideInboxId, source: 'override' };
    }
  }

  const metadata = conversation?.metadata ?? null;
  const resolvedChannel = channelType ?? conversation?.channel_type ?? null;
  const metaIntent =
    intent ??
    (metadata?.ai?.intent ? String(metadata.ai.intent) : null) ??
    (metadata?.assignment?.intent ? String(metadata.assignment.intent) : null);

  const dbMatch = await resolveFromDbInboxes({
    organizationId,
    channelType: resolvedChannel,
    intent: metaIntent,
    tagNames,
  });
  if (dbMatch) return dbMatch;

  try {
    const routing = await loadOrgAssignmentRouting(organizationId);
    const legacy = resolveTargetInbox({
      routing,
      metadata,
      channelType: resolvedChannel,
      intent: metaIntent,
      tagNames,
    });
    if (legacy?.inboxId) {
      const mapped = await mapLegacyInboxIdToUuid(organizationId, legacy.inboxId);
      if (mapped) {
        return { inboxId: mapped, source: legacy.source ?? 'assignment_routing', inboxName: legacy.inboxName };
      }
    }
  } catch {
    /* assignment settings optional */
  }

  const defaultId = await getDefaultInboxId(organizationId);
  if (!defaultId) throw new HttpError(500, 'No default inbox configured.');
  return { inboxId: defaultId, source: 'default' };
}

async function resolveFromDbInboxes({ organizationId, channelType, intent, tagNames }) {
  const { data, error } = await supabaseAdmin
    .from('inboxes')
    .select('id, name, settings, status')
    .eq('organization_id', organizationId)
    .eq('status', 'active');

  if (error) return null;
  const inboxes = data ?? [];
  if (inboxes.length === 0) return null;

  const ctx = {
    channelType: channelType ? String(channelType).toLowerCase() : null,
    intent: intent ? String(intent).toLowerCase() : null,
    tagNames: (tagNames ?? []).map((t) => String(t).toLowerCase()),
  };

  let best = null;
  let bestScore = 0;
  for (const row of inboxes) {
    const settings = mergeInboxSettings(row.settings);
    const pseudoInbox = {
      channels: settings.channels,
      intents: settings.intents,
      tags: settings.tags,
    };
    const score = scoreInboxRule(pseudoInbox, ctx);
    if (score > bestScore) {
      bestScore = score;
      best = { inboxId: row.id, inboxName: row.name, source: 'inbox_rules' };
    }
  }
  if (best && bestScore > 0) return best;

  if (channelType) {
    const mapped = settingsChannelMap(inboxes, channelType);
    if (mapped) return { inboxId: mapped.inboxId, source: 'channel_map', inboxName: mapped.name };
  }

  return null;
}

function settingsChannelMap(inboxes, channelType) {
  const ch = String(channelType).toLowerCase();
  for (const row of inboxes) {
    const settings = mergeInboxSettings(row.settings);
    const map = settings.channelInboxMap ?? {};
    if (map[ch]) {
      const target = inboxes.find((i) => i.id === map[ch] || i.slug === map[ch]);
      if (target) return { inboxId: target.id, name: target.name };
    }
  }
  return null;
}

async function validateActiveInbox(organizationId, inboxId) {
  const { data } = await supabaseAdmin
    .from('inboxes')
    .select('id')
    .eq('id', inboxId)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .maybeSingle();
  return Boolean(data?.id);
}

/**
 * Map legacy settings.assignment.inboxes[].id (string slug) to DB inbox UUID via slug or settings.legacyId.
 */
async function mapLegacyInboxIdToUuid(organizationId, legacyId) {
  if (!legacyId) return null;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRe.test(legacyId)) {
    const ok = await validateActiveInbox(organizationId, legacyId);
    return ok ? legacyId : null;
  }

  const { data } = await supabaseAdmin
    .from('inboxes')
    .select('id, slug, settings')
    .eq('organization_id', organizationId);

  for (const row of data ?? []) {
    const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};
    if (settings.legacyAssignmentInboxId === legacyId || row.slug === legacyId) {
      return row.id;
    }
  }
  const slug = String(legacyId).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const match = (data ?? []).find((r) => r.slug === slug);
  return match?.id ?? null;
}

/**
 * Apply resolved inbox to conversation row.
 */
export async function applyResolvedInboxToConversation({
  organizationId,
  conversationId,
  ...resolveParams
}) {
  const resolved = await resolveInboxForConversation({
    organizationId,
    ...resolveParams,
  });
  if (!resolved?.inboxId) return null;

  const { data: prior } = await supabaseAdmin
    .from('conversations')
    .select('inbox_id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (prior?.inbox_id && prior.inbox_id !== resolved.inboxId) {
    const defaultId = await getDefaultInboxId(organizationId);
    if (prior.inbox_id !== defaultId) {
      return { inboxId: prior.inbox_id, source: 'existing', skipped: true };
    }
  }

  await supabaseAdmin
    .from('conversations')
    .update({ inbox_id: resolved.inboxId })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  console.info(
    JSON.stringify({
      event: 'conversation.inbox_routed',
      organization_id: organizationId,
      conversation_id: conversationId,
      inbox_id: resolved.inboxId,
      source: resolved.source,
    }),
  );

  return resolved;
}
