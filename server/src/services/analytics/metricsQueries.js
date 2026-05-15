import { CONVERSATION_ACTIVE_STATUSES } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';

const CLOSED_STATUSES = ['closed', 'resolved'];

/**
 * @param {string} organizationId
 * @param {Date} fromDate inclusive UTC midnight
 * @param {Date} toExclusive exclusive UTC midnight (day after `to`)
 */
export async function fetchProductMetrics(organizationId, fromDate, toExclusive) {
  const fromIso = fromDate.toISOString();
  const toIso = toExclusive.toISOString();

  const activeList = [...CONVERSATION_ACTIVE_STATUSES];

  const [
    openRes,
    newConvRes,
    closedRes,
    inboundRes,
    outboundAgentRes,
    outboundAiRes,
    outboundFailedRes,
    channelRes,
    statusRes,
    assignmentRes,
    seriesConvRes,
    seriesInboundRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('status', activeList)
      .eq('is_spam', false),

    supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('status', CLOSED_STATUSES)
      .gte('last_message_at', fromIso)
      .lt('last_message_at', toIso),

    supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('sender_type', 'customer')
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('sender_type', 'agent')
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('sender_type', 'ai')
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('sender_type', 'agent')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .filter('metadata->>status', 'eq', 'failed'),

    supabaseAdmin
      .from('conversations')
      .select('channel_type')
      .eq('organization_id', organizationId)
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('conversations')
      .select('status')
      .eq('organization_id', organizationId)
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('conversations')
      .select('assignment_type')
      .eq('organization_id', organizationId)
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('conversations')
      .select('created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('messages')
      .select('created_at')
      .eq('organization_id', organizationId)
      .eq('sender_type', 'customer')
      .gte('created_at', fromIso)
      .lt('created_at', toIso),
  ]);

  const count = (res) => res.count ?? 0;

  return {
    openConversations: count(openRes),
    newConversations: count(newConvRes),
    closedConversations: count(closedRes),
    inboundMessages: count(inboundRes),
    outboundAgentMessages: count(outboundAgentRes),
    outboundAiMessages: count(outboundAiRes),
    outboundFailed: count(outboundFailedRes),
    byChannel: bucketRows(channelRes.data, 'channel_type', 'unknown'),
    byStatus: bucketRows(statusRes.data, 'status', 'unknown'),
    byAssignment: bucketRows(assignmentRes.data, 'assignment_type', 'unassigned'),
    seriesConversationsCreated: dailySeries(seriesConvRes.data, 'created_at', fromDate, toExclusive),
    seriesInboundMessages: dailySeries(seriesInboundRes.data, 'created_at', fromDate, toExclusive),
  };
}

function bucketRows(rows, field, fallback) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const row of rows ?? []) {
    const key = row?.[field] ?? fallback;
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.entries(out).map(([key, count]) => ({ key, count }));
}

function dailySeries(rows, field, fromDate, toExclusive) {
  /** @type {Record<string, number>} */
  const buckets = {};
  const cursor = new Date(fromDate);
  while (cursor < toExclusive) {
    buckets[cursor.toISOString().slice(0, 10)] = 0;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const row of rows ?? []) {
    const raw = row?.[field];
    if (!raw) continue;
    const day = String(raw).slice(0, 10);
    if (day in buckets) buckets[day] += 1;
  }
  return Object.entries(buckets).map(([t, v]) => ({ t, v }));
}

/**
 * Per-member outbound stats for team tab.
 * @param {string} organizationId
 * @param {Date} fromDate
 * @param {Date} toExclusive
 * @param {string | null} filterMemberId — AGENT role: only this member
 */
export async function fetchTeamMetrics(organizationId, fromDate, toExclusive, filterMemberId = null) {
  const fromIso = fromDate.toISOString();
  const toIso = toExclusive.toISOString();

  let q = supabaseAdmin
    .from('messages')
    .select('sender_member_id')
    .eq('organization_id', organizationId)
    .eq('sender_type', 'agent')
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .not('sender_member_id', 'is', null);

  if (filterMemberId) {
    q = q.eq('sender_member_id', filterMemberId);
  }

  const { data: messages, error } = await q;
  if (error) throw error;

  /** @type {Record<string, number>} */
  const counts = {};
  for (const m of messages ?? []) {
    const id = m.sender_member_id;
    if (!id) continue;
    counts[id] = (counts[id] ?? 0) + 1;
  }

  const memberIds = Object.keys(counts);
  if (memberIds.length === 0) {
    return { members: [] };
  }

  const { data: members, error: memErr } = await supabaseAdmin
    .from('organization_members')
    .select('id, user_id, role')
    .eq('organization_id', organizationId)
    .in('id', memberIds);

  if (memErr) throw memErr;

  const userIds = [...new Set((members ?? []).map((m) => m.user_id).filter(Boolean))];
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, email, first_name, last_name')
    .in('id', userIds);

  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  const rows = (members ?? []).map((m) => {
    const u = userById.get(m.user_id);
    const name = [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.email || 'Agent';
    return {
      memberId: m.id,
      displayName: name,
      role: m.role,
      outboundMessages: counts[m.id] ?? 0,
    };
  });

  rows.sort((a, b) => b.outboundMessages - a.outboundMessages);
  return { members: rows };
}

/**
 * @param {string} organizationId
 * @param {Date} fromDate
 * @param {Date} toExclusive
 */
export async function fetchAiMetrics(organizationId, fromDate, toExclusive) {
  const fromIso = fromDate.toISOString();
  const toIso = toExclusive.toISOString();

  const { data: runs, error, count } = await supabaseAdmin
    .from('ai_runs')
    .select('feature, status, latency_ms, input_tokens, output_tokens', { count: 'exact' })
    .eq('organization_id', organizationId)
    .gte('created_at', fromIso)
    .lt('created_at', toIso);

  if (error) {
    const missing =
      error.message?.includes('ai_runs') || error.code === '42P01' || error.code === 'PGRST205';
    if (missing) {
      return { available: false, totalRuns: 0, message: 'AI metrics appear after AI assist is configured.' };
    }
    throw error;
  }

  const list = runs ?? [];
  if (list.length === 0 && (count ?? 0) === 0) {
    return {
      available: true,
      totalRuns: 0,
      message: 'No AI activity in this period. Enable AI assist in Settings → AI & Automation.',
    };
  }

  /** @type {Record<string, number>} */
  const byFeature = {};
  let tokensIn = 0;
  let tokensOut = 0;
  const latencies = [];

  for (const r of list) {
    byFeature[r.feature] = (byFeature[r.feature] ?? 0) + 1;
    tokensIn += r.input_tokens ?? 0;
    tokensOut += r.output_tokens ?? 0;
    if (r.latency_ms != null) latencies.push(r.latency_ms);
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : null;
  const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : null;

  const { count: aiConvCount } = await supabaseAdmin
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('assignment_type', 'assigned_to_ai')
    .gte('created_at', fromIso)
    .lt('created_at', toIso);

  const { count: feedbackCount } = await supabaseAdmin
    .from('ai_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', fromIso)
    .lt('created_at', toIso);

  return {
    available: true,
    totalRuns: count ?? list.length,
    byFeature: Object.entries(byFeature).map(([feature, runCount]) => ({ feature, runCount })),
    tokensInput: tokensIn,
    tokensOutput: tokensOut,
    latencyMsP50: p50,
    latencyMsP95: p95,
    aiAssignedConversations: aiConvCount ?? 0,
    feedbackCount: feedbackCount ?? 0,
  };
}
