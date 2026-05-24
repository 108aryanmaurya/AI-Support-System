import { deltaPercent, parseAnalyticsDateRange } from './dateRange.js';
import { fetchKnowledgeMetrics } from './knowledgeMetrics.js';
import { fetchAiMetrics, fetchAiRunsPaginated, fetchProductMetrics } from './metricsQueries.js';
import { getWorkflowMetrics } from '../ai/workflowMetrics.service.js';
import { getAssignmentMetrics } from '../assignment/assignmentMetrics.service.js';

function kpi(id, label, value, previous, unit = 'count') {
  return {
    id,
    label,
    value,
    deltaPercent: deltaPercent(value, previous),
    unit,
  };
}

/**
 * @param {string} organizationId
 * @param {Record<string, unknown>} query
 */
export async function getAnalyticsOverview(organizationId, query) {
  const range = parseAnalyticsDateRange(query);
  const [current, previous, ai, workflow, assignment] = await Promise.all([
    fetchProductMetrics(organizationId, range.fromDate, range.toExclusive),
    fetchProductMetrics(organizationId, range.compareFrom, range.compareToExclusive),
    fetchAiMetrics(organizationId, range.fromDate, range.toExclusive),
    getWorkflowMetrics(organizationId, { days: 7 }).catch(() => null),
    getAssignmentMetrics(organizationId, { days: 7 }).catch(() => null),
  ]);

  const outboundTotal =
    current.outboundAgentMessages + current.outboundAiMessages;
  const prevOutboundTotal =
    previous.outboundAgentMessages + previous.outboundAiMessages;
  const failureRate =
    outboundTotal > 0
      ? Math.round((current.outboundFailed / outboundTotal) * 1000) / 10
      : 0;
  const prevFailureRate =
    prevOutboundTotal > 0
      ? Math.round((previous.outboundFailed / prevOutboundTotal) * 1000) / 10
      : 0;

  return {
    range: { from: range.fromIso, to: range.toIso },
    compare: { from: range.compareFromIso, to: range.compareToIso },
    kpis: [
      kpi(
        'conversations_open',
        'Open conversations',
        current.openConversations,
        previous.openConversations,
      ),
      kpi(
        'conversations_new',
        'New conversations',
        current.newConversations,
        previous.newConversations,
      ),
      kpi(
        'conversations_closed',
        'Closed (activity in range)',
        current.closedConversations,
        previous.closedConversations,
      ),
      kpi(
        'messages_inbound',
        'Customer messages',
        current.inboundMessages,
        previous.inboundMessages,
      ),
      kpi(
        'messages_outbound',
        'Team replies sent',
        current.outboundAgentMessages,
        previous.outboundAgentMessages,
      ),
      kpi(
        'outbound_failure_rate',
        'Outbound failure rate',
        failureRate,
        prevFailureRate,
        'percent',
      ),
    ],
    series: {
      conversations_created: current.seriesConversationsCreated,
      inbound_messages: current.seriesInboundMessages,
    },
    breakdowns: {
      channel: current.byChannel,
      status: current.byStatus,
      assignment: current.byAssignment,
    },
    ai: {
      enabled: true,
      available: ai.available !== false,
      message: ai.message ?? null,
      summary: ai.available !== false ? {
        totalRuns: ai.totalRuns,
        tokensInput: ai.tokensInput,
        tokensOutput: ai.tokensOutput,
        tokensTotal: ai.tokensTotal,
        acceptanceRate: ai.acceptanceRate,
        aiAssignedConversations: ai.aiAssignedConversations,
      } : null,
    },
    workflow: workflow
      ? {
          queueDepth: workflow.queue?.available ? workflow.queue.depth : null,
          actionsApplied: workflow.events?.available ? workflow.events.applied : null,
          rulesEnabled: workflow.rules?.enabled ?? 0,
          settingsPath: `/org/${organizationId}/settings/workflows`,
        }
      : null,
    assignment: assignment
      ? {
          queueDepth: assignment.queue?.available ? assignment.queue.depth : null,
          autoApplied: assignment.outcomes?.auto_applied ?? 0,
          fallbackPct: assignment.outcomes?.fallback_unassigned_pct ?? null,
          reassignRatePct: assignment.outcomes?.reassign_rate_pct ?? null,
          latencyP50Ms: assignment.latency?.p50Ms ?? null,
          latencyP95Ms: assignment.latency?.p95Ms ?? null,
          fairnessStdDev: assignment.fairness?.activeChatsStdDev ?? null,
          settingsPath: assignment.settingsPath ?? `/org/${organizationId}/settings/assignment`,
        }
      : null,
  };
}

export async function getAnalyticsConversations(organizationId, query) {
  const range = parseAnalyticsDateRange(query);
  const current = await fetchProductMetrics(organizationId, range.fromDate, range.toExclusive);
  const previous = await fetchProductMetrics(
    organizationId,
    range.compareFrom,
    range.compareToExclusive,
  );

  return {
    range: { from: range.fromIso, to: range.toIso },
    compare: { from: range.compareFromIso, to: range.compareToIso },
    totals: {
      newConversations: current.newConversations,
      newConversationsDelta: deltaPercent(
        current.newConversations,
        previous.newConversations,
      ),
      inboundMessages: current.inboundMessages,
      inboundMessagesDelta: deltaPercent(
        current.inboundMessages,
        previous.inboundMessages,
      ),
      outboundAgentMessages: current.outboundAgentMessages,
      outboundAiMessages: current.outboundAiMessages,
    },
    breakdowns: {
      channel: current.byChannel,
      status: current.byStatus,
      assignment: current.byAssignment,
    },
    series: {
      conversations_created: current.seriesConversationsCreated,
      inbound_messages: current.seriesInboundMessages,
    },
  };
}

export async function getAnalyticsTeam(organizationId, query, membership) {
  const range = parseAnalyticsDateRange(query);
  const role = membership?.role?.toUpperCase();
  const filterMemberId = role === 'AGENT' ? membership.id : null;

  const team = await fetchAiMetrics(
    organizationId,
    range.fromDate,
    range.toExclusive,
    filterMemberId,
  );

  return {
    range: { from: range.fromIso, to: range.toIso },
    role,
    members: team.members,
  };
}

export async function getAnalyticsKnowledge(organizationId, query) {
  const range = parseAnalyticsDateRange(query);
  const [current, previous] = await Promise.all([
    fetchKnowledgeMetrics(organizationId, range.fromDate, range.toExclusive),
    fetchKnowledgeMetrics(organizationId, range.compareFrom, range.compareToExclusive),
  ]);

  if (current.available === false) {
    return {
      range: { from: range.fromIso, to: range.toIso },
      available: false,
      message: current.message,
    };
  }

  return {
    range: { from: range.fromIso, to: range.toIso },
    compare: { from: range.compareFromIso, to: range.compareToIso },
    available: true,
    kpis: [
      kpi('kb_published', 'Published articles', current.publishedArticles, previous.publishedArticles),
      kpi('kb_searches', 'Knowledge searches', current.searchesInRange, previous.searchesInRange),
      kpi('kb_views', 'Article views', current.articleViewsInRange, previous.articleViewsInRange),
      kpi('kb_stale', `Stale (>${current.staleDays}d)`, current.staleArticles, previous.staleArticles),
      kpi(
        'kb_ingest_failed',
        'Failed ingestions (range)',
        current.ingestFailedInRange,
        previous.ingestFailedInRange,
      ),
    ],
    totals: {
      draftArticles: current.draftArticles,
      sourcesFailed: current.sourcesFailedTotal,
      ingestCompletedInRange: current.ingestCompletedInRange,
    },
  };
}

export async function getAnalyticsAi(organizationId, query) {
  const range = parseAnalyticsDateRange(query);
  const [ai, previousAi, product] = await Promise.all([
    fetchAiMetrics(organizationId, range.fromDate, range.toExclusive),
    fetchAiMetrics(organizationId, range.compareFrom, range.compareToExclusive),
    fetchProductMetrics(organizationId, range.fromDate, range.toExclusive),
  ]);

  const prevAccept = previousAi.acceptanceRate;
  const acceptDelta =
    ai.acceptanceRate != null && prevAccept != null
      ? Math.round((ai.acceptanceRate - prevAccept) * 10) / 10
      : 0;

  return {
    range: { from: range.fromIso, to: range.toIso },
    compare: { from: range.compareFromIso, to: range.compareToIso },
    ...ai,
    totalRunsDelta:
      ai.totalRuns != null && previousAi.totalRuns != null
        ? deltaPercent(ai.totalRuns, previousAi.totalRuns)
        : 0,
    acceptanceRateDelta: acceptDelta,
    productContext: {
      outboundAiMessages: product.outboundAiMessages,
      aiAssignedConversations: ai.aiAssignedConversations ?? 0,
    },
  };
}

/**
 * @param {string} organizationId
 * @param {Record<string, unknown>} query
 */
export async function getAnalyticsAiRuns(organizationId, query) {
  const range = parseAnalyticsDateRange(query);
  const page = Number(query.page);
  const pageSize = Number(query.pageSize);
  const feature =
    typeof query.feature === 'string' && query.feature.trim() ? query.feature.trim() : null;
  const status =
    typeof query.status === 'string' && query.status.trim() ? query.status.trim() : null;

  const runs = await fetchAiRunsPaginated(organizationId, {
    fromDate: range.fromDate,
    toExclusive: range.toExclusive,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    feature,
    status,
  });

  return {
    range: { from: range.fromIso, to: range.toIso },
    ...runs,
  };
}
