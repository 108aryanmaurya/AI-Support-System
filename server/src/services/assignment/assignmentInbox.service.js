import {
  mergeOrgAssignmentRouting,
  parseConversationMetadataAssignment,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';

/**
 * @param {string} organizationId
 */
export async function loadOrgAssignmentRouting(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load organization settings.');
  }
  if (!data) {
    throw new HttpError(404, 'Organization not found.');
  }
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  return mergeOrgAssignmentRouting(settings.assignment);
}

/**
 * @param {object} routing — from {@link mergeOrgAssignmentRouting}
 * @param {string} inboxId
 */
export function getInboxById(routing, inboxId) {
  return (routing.inboxes ?? []).find((i) => i.id === inboxId) ?? null;
}

/**
 * Score inbox rules for a conversation context (higher wins).
 *
 * @param {object} inbox
 * @param {object} ctx
 */
export function scoreInboxRule(inbox, ctx) {
  let score = 0;
  const channels = inbox.channels ?? [];
  const intents = inbox.intents ?? [];
  const languages = inbox.languages ?? [];
  const tags = inbox.tags ?? [];

  if (ctx.channelType && channels.includes(ctx.channelType)) score += 10;
  if (ctx.intent && intents.includes(ctx.intent)) score += 25;
  if (ctx.language && languages.includes(ctx.language)) score += 8;
  for (const tag of ctx.tagNames ?? []) {
    if (tags.includes(tag)) {
      score += 15;
      break;
    }
  }
  return score;
}

/**
 * Resolve target inbox for routing.
 *
 * @param {object} params
 * @param {object} params.routing
 * @param {object} [params.metadata]
 * @param {string | null} [params.channelType]
 * @param {string | null} [params.intent]
 * @param {string | null} [params.language]
 * @param {string[]} [params.tagNames]
 * @param {string | null} [params.overrideInboxId]
 */
export function resolveTargetInbox({
  routing,
  metadata,
  channelType = null,
  intent = null,
  language = null,
  tagNames = [],
  overrideInboxId = null,
}) {
  if (overrideInboxId) {
    const inbox = getInboxById(routing, overrideInboxId);
    return {
      inboxId: overrideInboxId,
      inboxName: inbox?.name ?? overrideInboxId,
      source: 'override',
    };
  }

  const metaAssign = parseConversationMetadataAssignment(metadata);
  if (metaAssign?.targetInboxId) {
    const inbox = getInboxById(routing, metaAssign.targetInboxId);
    return {
      inboxId: metaAssign.targetInboxId,
      inboxName: inbox?.name ?? metaAssign.targetInboxId,
      source: metaAssign.source ?? 'metadata',
      ruleId: metaAssign.ruleId ?? null,
    };
  }

  if (channelType && routing.channelInboxMap?.[channelType]) {
    const id = routing.channelInboxMap[channelType];
    const inbox = getInboxById(routing, id);
    return { inboxId: id, inboxName: inbox?.name ?? id, source: 'channel_map' };
  }

  const ctx = {
    channelType,
    intent: intent ? String(intent).toLowerCase() : null,
    language: language ? String(language).toLowerCase() : null,
    tagNames: tagNames.map((t) => String(t).toLowerCase()),
  };

  let best = null;
  let bestScore = 0;
  for (const inbox of routing.inboxes ?? []) {
    const score = scoreInboxRule(inbox, ctx);
    if (score > bestScore) {
      bestScore = score;
      best = inbox;
    }
  }

  if (best && bestScore > 0) {
    return { inboxId: best.id, inboxName: best.name, source: 'rules', matchScore: bestScore };
  }

  const fallbackId = routing.defaultInboxId ?? 'default';
  const fallback = getInboxById(routing, fallbackId);
  return {
    inboxId: fallbackId,
    inboxName: fallback?.name ?? 'General Support',
    source: 'default',
  };
}

/**
 * Persist resolved inbox on conversation metadata (workflow / sync).
 *
 * @param {string} organizationId
 * @param {string} conversationId
 * @param {object} target
 * @param {string} target.inboxId
 * @param {string} [target.source]
 * @param {string | null} [target.ruleId]
 */
export async function persistConversationTargetInbox(
  organizationId,
  conversationId,
  { inboxId, source = 'system', ruleId = null },
) {
  const { data: row, error: readErr } = await supabaseAdmin
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (readErr || !row) return false;

  const meta =
    row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
  const prior =
    meta.assignment && typeof meta.assignment === 'object' ? { ...meta.assignment } : {};

  if (prior.target_inbox_id === inboxId && prior.source === source) {
    return false;
  }

  meta.assignment = {
    ...prior,
    target_inbox_id: inboxId,
    source,
    rule_id: ruleId,
    updated_at: new Date().toISOString(),
  };

  const { error: updErr } = await supabaseAdmin
    .from('conversations')
    .update({ metadata: meta })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  return !updErr;
}

/**
 * Re-resolve inbox from current conversation state and persist when changed.
 *
 * @param {string} organizationId
 * @param {string} conversationId
 */
export async function syncConversationAssignmentRouting(organizationId, conversationId) {
  const { data: conv, error } = await supabaseAdmin
    .from('conversations')
    .select('id, metadata, channel_type')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !conv) return;

  const { getConversationAiSignals } = await import('../ai/conversationAiSignals.service.js');
  const { getConversationTags } = await import('../tags.service.js');

  let intent = null;
  let language = null;
  try {
    const signals = await getConversationAiSignals(organizationId, conversationId);
    intent = signals.classification?.intent ?? null;
    language = signals.classification?.language ?? null;
  } catch {
    /* optional */
  }

  let tagNames = [];
  try {
    const { tags } = await getConversationTags(organizationId, conversationId);
    tagNames = (tags ?? []).map((t) => String(t.name ?? '').toLowerCase()).filter(Boolean);
  } catch {
    /* optional */
  }

  const routing = await loadOrgAssignmentRouting(organizationId);
  const target = resolveTargetInbox({
    routing,
    metadata: conv.metadata,
    channelType: conv.channel_type ?? null,
    intent,
    language,
    tagNames,
  });

  await persistConversationTargetInbox(organizationId, conversationId, {
    inboxId: target.inboxId,
    source: 'workflow_sync',
    ruleId: target.ruleId ?? null,
  });
}
