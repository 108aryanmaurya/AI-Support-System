import { CONVERSATION_ACTIVE_STATUSES, percentile, stddevActiveChats } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { getAssignmentRedisSnapshot } from './assignmentRedis.service.js';

const ASSIGNMENT_JOB_TYPES = ['assignment.auto_route', 'assignment.reassign'];

const ASSIGNMENT_EVENT_TYPES = [
  'assignment.auto_applied',
  'assignment.auto_skipped',
  'assignment.auto_failed',
  'assignment.reassigned',
  'assignment.reassign_skipped',
];

const FALLBACK_SKIP_REASONS = new Set([
  'no_candidates',
  'no_candidates_after_exclude',
]);

/**
 * @param {string} organizationId
 * @param {{ days?: number }} [opts]
 */
export async function getAssignmentMetrics(organizationId, opts = {}) {
  const days = Number.isFinite(opts.days) ? Math.max(1, Math.min(90, Math.floor(opts.days))) : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const countJobs = async (status) => {
    const { count, error } = await supabaseAdmin
      .from('automation_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', status)
      .in('job_type', ASSIGNMENT_JOB_TYPES);

    if (error) {
      if (
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        error.message?.includes('automation_jobs')
      ) {
        return null;
      }
      throw new HttpError(500, error.message || 'Failed to count assignment jobs.');
    }
    return count ?? 0;
  };

  const [pending, processing, failed, dead] = await Promise.all([
    countJobs('pending'),
    countJobs('processing'),
    countJobs('failed'),
    countJobs('dead'),
  ]);

  const queue =
    pending === null
      ? { available: false, message: 'automation_jobs table not available' }
      : {
          available: true,
          pending,
          processing,
          failed,
          dead,
          depth: (pending ?? 0) + (processing ?? 0),
        };

  /** @type {number[]} */
  const jobDurationsMs = [];
  const { data: completedJobs, error: jobsErr } = await supabaseAdmin
    .from('automation_jobs')
    .select('created_at, completed_at, job_type')
    .eq('organization_id', organizationId)
    .eq('status', 'completed')
    .in('job_type', ASSIGNMENT_JOB_TYPES)
    .gte('completed_at', since)
    .not('completed_at', 'is', null)
    .limit(5000);

  if (jobsErr) {
    if (
      !(
        jobsErr.code === '42P01' ||
        jobsErr.code === 'PGRST205' ||
        jobsErr.message?.includes('automation_jobs')
      )
    ) {
      throw new HttpError(500, jobsErr.message || 'Failed to load assignment job durations.');
    }
  } else {
    for (const row of completedJobs ?? []) {
      const start = new Date(row.created_at).getTime();
      const end = new Date(row.completed_at).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        jobDurationsMs.push(end - start);
      }
    }
  }

  let events = {
    available: false,
    since,
    days,
    auto_applied: 0,
    auto_skipped: 0,
    auto_failed: 0,
    reassigned: 0,
    reassign_skipped: 0,
    fallback_skipped: 0,
    lock_held_skipped: 0,
    redis_unavailable_skipped: 0,
  };

  const { data: eventRows, error: evErr } = await supabaseAdmin
    .from('support_events')
    .select('event_type, payload')
    .eq('organization_id', organizationId)
    .gte('created_at', since)
    .in('event_type', ASSIGNMENT_EVENT_TYPES);

  if (!evErr && eventRows) {
    events = { ...events, available: true };
    for (const row of eventRows) {
      const t = row.event_type;
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
      const reason = typeof payload.reason === 'string' ? payload.reason : '';

      if (t === 'assignment.auto_applied') events.auto_applied += 1;
      else if (t === 'assignment.auto_skipped') {
        events.auto_skipped += 1;
        if (FALLBACK_SKIP_REASONS.has(reason)) events.fallback_skipped += 1;
        if (reason === 'lock_held') events.lock_held_skipped += 1;
        if (reason === 'redis_unavailable') events.redis_unavailable_skipped += 1;
      } else if (t === 'assignment.auto_failed') events.auto_failed += 1;
      else if (t === 'assignment.reassigned') events.reassigned += 1;
      else if (t === 'assignment.reassign_skipped') events.reassign_skipped += 1;
    }
  } else if (
    evErr &&
    !(
      evErr.code === '42P01' ||
      evErr.code === 'PGRST205' ||
      evErr.message?.includes('support_events')
    )
  ) {
    throw new HttpError(500, evErr.message || 'Failed to load assignment events.');
  }

  const autoAttempts = events.auto_applied + events.auto_skipped + events.auto_failed;
  const fallbackPct =
    autoAttempts > 0
      ? Math.round((events.fallback_skipped / autoAttempts) * 1000) / 10
      : null;
  const reassignRate =
    events.auto_applied > 0
      ? Math.round((events.reassigned / events.auto_applied) * 1000) / 10
      : null;

  const fairness = await computeFairnessSnapshot(organizationId);

  return {
    range: { days, since },
    queue,
    latency: {
      sampleSize: jobDurationsMs.length,
      p50Ms: percentile(jobDurationsMs, 50),
      p95Ms: percentile(jobDurationsMs, 95),
    },
    outcomes: {
      auto_applied: events.auto_applied,
      auto_skipped: events.auto_skipped,
      auto_failed: events.auto_failed,
      reassigned: events.reassigned,
      reassign_skipped: events.reassign_skipped,
      fallback_unassigned_pct: fallbackPct,
      reassign_rate_pct: reassignRate,
      lock_contention_skips: events.lock_held_skipped,
      redis_unavailable_skips: events.redis_unavailable_skipped,
    },
    fairness,
    eventsAvailable: events.available,
    reportsHint:
      'Assignment KPIs also surface on Reports → Overview when auto-route is enabled. See docs/features/auto-assignment-operations.md for worker/Redis runbook.',
    settingsPath: `/org/${organizationId}/settings/assignment`,
  };
}

/**
 * @param {string} organizationId
 */
async function computeFairnessSnapshot(organizationId) {
  const { data: members, error: mErr } = await supabaseAdmin
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE');

  if (mErr) {
    return { available: false, message: mErr.message };
  }

  const memberIds = (members ?? []).map((m) => m.id);
  if (memberIds.length === 0) {
    return { available: true, agentCount: 0, activeChatsStdDev: null, perAgent: [] };
  }

  const { data: convs, error: cErr } = await supabaseAdmin
    .from('conversations')
    .select('assigned_to_member_id')
    .eq('organization_id', organizationId)
    .eq('assignment_type', 'assigned_to_agent')
    .in('status', [...CONVERSATION_ACTIVE_STATUSES])
    .not('assigned_to_member_id', 'is', null);

  if (cErr) {
    return { available: false, message: cErr.message };
  }

  const dbCounts = new Map(memberIds.map((id) => [id, 0]));
  for (const row of convs ?? []) {
    const mid = row.assigned_to_member_id;
    if (dbCounts.has(mid)) dbCounts.set(mid, (dbCounts.get(mid) ?? 0) + 1);
  }

  const redisSnap = await getAssignmentRedisSnapshot(organizationId, memberIds);
  const perAgent = memberIds.map((id) => {
    const redisChats = redisSnap.get(id)?.activeChats;
    const dbChats = dbCounts.get(id) ?? 0;
    return {
      memberId: id,
      activeChatsDb: dbChats,
      activeChatsRedis: redisChats,
      activeChats: redisChats != null ? redisChats : dbChats,
    };
  });

  const counts = perAgent.map((r) => r.activeChats);

  return {
    available: true,
    agentCount: memberIds.length,
    activeChatsStdDev: stddevActiveChats(counts),
    activeChatsMean:
      counts.length > 0
        ? Math.round((counts.reduce((a, b) => a + b, 0) / counts.length) * 100) / 100
        : null,
    perAgent,
  };
}
