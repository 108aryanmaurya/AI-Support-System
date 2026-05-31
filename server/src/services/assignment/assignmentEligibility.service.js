import {
  applySlaUrgentRanking,
  conversationMatchesVipTags,
  defaultAgentProfileRow,
  inboxScoringStrategyFromSettings,
  isDedicatedInboxAssignmentStrategy,
} from '@ai-support/shared';
import { HttpError } from '../../utils/httpError.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { getConversationAiSignals } from '../ai/conversationAiSignals.service.js';
import { getConversationTags } from '../tags.service.js';
import { getAssignmentRedisSnapshot } from './assignmentRedis.service.js';
import { resolveSlaRoutingContext } from './assignmentSlaBoost.service.js';
import {
  getInboxById,
  loadOrgAssignmentRouting,
  resolveTargetInbox,
} from './assignmentInbox.service.js';
import { loadInboxMemberIds } from '../inboxes.service.js';
import { loadQueueInboxSettingsForConversation } from './assignmentSettings.service.js';
import { evaluateMemberEligibility } from './assignmentEligibility.filters.js';
import {
  loadPreviousAgentForCustomer,
  rankEligibleAgents,
} from './assignmentScoring.service.js';

/**
 * @param {string} organizationId
 */
async function loadCandidateMembers(organizationId) {
  const { data: members, error } = await supabaseAdmin
    .from('organization_members')
    .select('id, user_id, role, status')
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE');

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load organization members.');
  }
  return members ?? [];
}

/**
 * @param {string} organizationId
 * @param {string[]} memberIds
 */
async function loadAgentProfiles(organizationId, memberIds) {
  if (memberIds.length === 0) {
    return { profiles: new Map(), presenceDb: new Map(), defaults: defaultAgentProfileRow() };
  }

  const [profilesRes, presenceRes] = await Promise.all([
    supabaseAdmin
      .from('agent_profiles')
      .select('member_id, status, max_concurrency, shift_start, shift_end, timezone')
      .eq('organization_id', organizationId)
      .in('member_id', memberIds),
    supabaseAdmin
      .from('agent_presence')
      .select('member_id, presence, last_seen')
      .eq('organization_id', organizationId)
      .in('member_id', memberIds),
  ]);

  const defaults = defaultAgentProfileRow();
  const profiles = new Map();
  for (const row of profilesRes.data ?? []) {
    profiles.set(row.member_id, row);
  }

  const presenceDb = new Map((presenceRes.data ?? []).map((r) => [r.member_id, r]));

  return { profiles, presenceDb, defaults };
}

function timeToApi(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : null;
  }
  return null;
}

/**
 * Build routing + eligibility preview for a conversation.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string | null} [params.overrideInboxId]
 * @param {string[]} [params.excludeMemberIds]
 * @param {boolean} [params.skipSticky]
 */
export async function previewAssignmentEligibility({
  organizationId,
  conversationId,
  overrideInboxId = null,
  excludeMemberIds = [],
  skipSticky = false,
}) {
  const { data: conv, error: convErr } = await supabaseAdmin
    .from('conversations')
    .select(
      'id, metadata, channel_type, priority, assignment_type, assigned_to_member_id, customer_id, inbox_id, team_inbox_id',
    )
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (convErr) {
    throw new HttpError(500, convErr.message || 'Failed to load conversation.');
  }
  if (!conv) {
    throw new HttpError(404, 'Conversation not found in this organization.');
  }

  const routing = await loadOrgAssignmentRouting(organizationId);

  let intent = null;
  let language = null;
  let autoTags = [];
  try {
    const signals = await getConversationAiSignals(organizationId, conversationId);
    intent = signals.classification?.intent ?? null;
    language = signals.classification?.language ?? null;
    autoTags = signals.classification?.auto_tags ?? [];
  } catch {
    /* classification optional */
  }

  let tagNames = [...autoTags.map((t) => String(t).toLowerCase())];
  try {
    const { tags } = await getConversationTags(organizationId, conversationId);
    for (const t of tags ?? []) {
      const name = String(t.name ?? '').trim().toLowerCase();
      if (name && !tagNames.includes(name)) tagNames.push(name);
    }
  } catch {
    /* tags optional */
  }

  const isVip =
    routing.vip_routing_enabled &&
    conversationMatchesVipTags(tagNames, routing.vip_tag_names ?? []);

  const effectiveOverrideInboxId =
    isVip && routing.vip_target_inbox_id ? routing.vip_target_inbox_id : overrideInboxId;

  const targetInbox = resolveTargetInbox({
    routing,
    metadata: conv.metadata,
    channelType: conv.channel_type ?? null,
    intent,
    language,
    tagNames,
    overrideInboxId: effectiveOverrideInboxId,
  });

  const queueInboxId = conv.team_inbox_id ?? conv.inbox_id ?? null;
  let inboxStrategy = null;
  if (queueInboxId) {
    const { settings: queueSettings } = await loadQueueInboxSettingsForConversation(
      organizationId,
      conversationId,
    );
    inboxStrategy = inboxScoringStrategyFromSettings(queueSettings);
  }

  let inboxMemberIds = null;
  if (queueInboxId) {
    inboxMemberIds = await loadInboxMemberIds(queueInboxId);
  }
  if (!inboxMemberIds?.length) {
    const inbox = getInboxById(routing, targetInbox.inboxId);
    inboxMemberIds = inbox?.memberIds?.length > 0 ? inbox.memberIds : null;
  }

  const members = await loadCandidateMembers(organizationId);
  const memberIds = members.map((m) => m.id);
  const { profiles, presenceDb, defaults } = await loadAgentProfiles(organizationId, memberIds);
  const redisSnap = await getAssignmentRedisSnapshot(organizationId, memberIds);

  const now = new Date();
  const ctx = {
    now,
    targetInboxId: targetInbox.inboxId,
    inboxMemberIds,
    intent: intent ? String(intent).toLowerCase() : null,
    language: language ? String(language).toLowerCase() : null,
    tagNames,
    priority: conv.priority ?? null,
  };

  /** @type {object[]} */
  const candidates = [];
  const eligibleMemberIds = [];
  /** @type {object[]} */
  const eligibleRows = [];

  for (const m of members) {
    const profile = profiles.get(m.id);
    const redis = redisSnap.get(m.id) ?? { presence: null, activeChats: null };
    const dbPresence = presenceDb.get(m.id);
    const effectivePresence = redis.presence ?? dbPresence?.presence ?? 'offline';

    const memberRow = {
      memberId: m.id,
      role: m.role,
      membershipStatus: m.status,
      routingStatus: profile?.status ?? defaults.status,
      maxConcurrency: profile?.max_concurrency ?? defaults.max_concurrency,
      shiftStart: timeToApi(profile?.shift_start),
      shiftEnd: timeToApi(profile?.shift_end),
      timezone: profile?.timezone ?? defaults.timezone,
      presence: effectivePresence,
      activeChats: redis.activeChats,
    };

    const result = evaluateMemberEligibility(memberRow, ctx);
    candidates.push({
      memberId: m.id,
      role: m.role,
      eligible: result.eligible,
      drops: result.drops,
      presence: effectivePresence,
      activeChats: redis.activeChats,
      maxConcurrency: memberRow.maxConcurrency,
    });

    if (result.eligible) {
      eligibleMemberIds.push(m.id);
      eligibleRows.push({
        memberId: m.id,
        skillMatchTier: 'generic',
        activeChats: redis.activeChats ?? 0,
        maxConcurrency: memberRow.maxConcurrency,
        lastSeen: dbPresence?.last_seen ?? null,
      });
    }
  }

  const excludeSet = new Set((excludeMemberIds ?? []).filter(Boolean));
  let filteredEligibleRows = eligibleRows.filter((r) => !excludeSet.has(r.memberId));
  let filteredEligibleMemberIds = eligibleMemberIds.filter((id) => !excludeSet.has(id));

  const strategy = inboxStrategy ?? null;
  const dedicatedInboxStrategy = isDedicatedInboxAssignmentStrategy(inboxStrategy);
  const scoringInboxId = queueInboxId ?? targetInbox.inboxId;

  const previousAgentId =
    skipSticky || dedicatedInboxStrategy
      ? null
      : await loadPreviousAgentForCustomer(
          organizationId,
          conv.customer_id ?? null,
          conversationId,
        );

  let ranking = {
    strategy,
    rankedCandidates: [],
    recommendedMemberId: null,
  };

  if (filteredEligibleRows.length > 0 && strategy) {
    ranking = await rankEligibleAgents({
      organizationId,
      inboxId: scoringInboxId,
      strategy,
      priority: conv.priority ?? null,
      previousAgentId,
      eligibleRows: filteredEligibleRows,
    });
  }

  const slaContext = await resolveSlaRoutingContext(organizationId, conversationId, routing);
  let slaBoostApplied = false;
  if (
    slaContext.urgent &&
    ranking.rankedCandidates.length > 0 &&
    !dedicatedInboxStrategy
  ) {
    const activeChatsByMember = new Map(
      filteredEligibleRows.map((r) => [r.memberId, r.activeChats ?? 0]),
    );
    const boosted = applySlaUrgentRanking(ranking.rankedCandidates, activeChatsByMember);
    ranking = {
      ...ranking,
      rankedCandidates: boosted.rankedCandidates,
      recommendedMemberId: boosted.recommendedMemberId,
    };
    slaBoostApplied = boosted.slaBoostApplied;
  }
  slaContext.slaBoostApplied = slaBoostApplied;

  const scoreByMember = new Map(
    ranking.rankedCandidates.map((r) => [r.memberId, r]),
  );

  for (const c of candidates) {
    const scored = scoreByMember.get(c.memberId);
    if (scored) {
      c.finalScore = scored.finalScore;
      c.breakdown = scored.breakdown;
      c.factors = scored.factors;
      c.stickyMatch = scored.stickyMatch;
      const rankIdx = ranking.rankedCandidates.findIndex((r) => r.memberId === c.memberId);
      c.rank = rankIdx >= 0 ? rankIdx + 1 : null;
    }
  }

  candidates.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.eligible && b.eligible) {
      return (a.rank ?? 999) - (b.rank ?? 999);
    }
    return String(a.memberId).localeCompare(String(b.memberId));
  });

  const dropCodeCounts = {};
  for (const c of candidates) {
    if (c.eligible) continue;
    for (const d of c.drops) {
      dropCodeCounts[d.code] = (dropCodeCounts[d.code] ?? 0) + 1;
    }
  }

  const noCandidates =
    filteredEligibleMemberIds.length === 0
      ? {
          reason: isVip ? 'no_vip_candidates' : 'no_candidates',
          primaryCodes: Object.entries(dropCodeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([code]) => code),
        }
      : null;

  return {
    conversationId,
    targetInbox,
    inboxMemberRestriction: inboxMemberIds ? inboxMemberIds.length : null,
    routingContext: {
      channelType: conv.channel_type ?? null,
      intent,
      language,
      tagNames,
      priority: conv.priority ?? null,
    },
    eligibleMemberIds: filteredEligibleMemberIds,
    candidates,
    strategy: ranking.strategy,
    rankedCandidates: ranking.rankedCandidates,
    recommendedMemberId: ranking.recommendedMemberId,
    previousAgentId,
    sla: slaContext,
    vip: isVip
      ? {
          matched: true,
          targetInboxId: routing.vip_target_inbox_id ?? null,
        }
      : { matched: false },
    summary: {
      totalMembers: candidates.length,
      eligibleCount: filteredEligibleMemberIds.length,
      droppedCount: candidates.length - filteredEligibleMemberIds.length,
      excludedCount: excludeSet.size,
    },
    noCandidates,
  };
}

/**
 * Eligible member ids only (Sprint 5 auto-route).
 *
 * @param {string} organizationId
 * @param {string} conversationId
 */
export async function listEligibleMemberIds(organizationId, conversationId) {
  const preview = await previewAssignmentEligibility({ organizationId, conversationId });
  return {
    eligibleMemberIds: preview.eligibleMemberIds,
    noCandidates: preview.noCandidates,
    targetInbox: preview.targetInbox,
  };
}
