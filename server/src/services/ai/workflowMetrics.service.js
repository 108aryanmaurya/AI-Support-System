import { WORKFLOW_AUTOMATION_JOB_TYPES } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { getOrgWorkflowRules } from './workflowRules.service.js';

const WORKFLOW_EVENT_PREFIX = 'workflow.';

/**
 * Org-scoped workflow ops snapshot (queue + support_events + rule counts).
 *
 * @param {string} organizationId
 * @param {{ days?: number }} [opts]
 */
export async function getWorkflowMetrics(organizationId, opts = {}) {
  const days = Number.isFinite(opts.days) ? Math.max(1, Math.min(90, Math.floor(opts.days))) : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const countJobs = async (status) => {
    const { count, error } = await supabaseAdmin
      .from('automation_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', status)
      .in('job_type', [...WORKFLOW_AUTOMATION_JOB_TYPES]);

    if (error) {
      if (
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        error.message?.includes('automation_jobs')
      ) {
        return null;
      }
      throw new HttpError(500, error.message || 'Failed to count automation jobs.');
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

  let events = { available: false, since, days, applied: 0, skipped: 0, failed: 0, sla_warning: 0, tag_added: 0 };
  const { data: eventRows, error: evErr } = await supabaseAdmin
    .from('support_events')
    .select('event_type')
    .eq('organization_id', organizationId)
    .gte('created_at', since)
    .like('event_type', `${WORKFLOW_EVENT_PREFIX}%`);

  if (!evErr && eventRows) {
    events = { available: true, since, days, applied: 0, skipped: 0, failed: 0, sla_warning: 0, tag_added: 0 };
    for (const row of eventRows) {
      const t = row.event_type;
      if (t === 'workflow.action_applied') events.applied += 1;
      else if (t === 'workflow.action_skipped') events.skipped += 1;
      else if (t === 'workflow.action_failed') events.failed += 1;
      else if (t === 'workflow.sla_warning_applied') events.sla_warning += 1;
      else if (t === 'workflow.tag_added_applied') events.tag_added += 1;
    }
  } else if (
    evErr &&
    !(
      evErr.code === '42P01' ||
      evErr.code === 'PGRST205' ||
      evErr.message?.includes('support_events')
    )
  ) {
    throw new HttpError(500, evErr.message || 'Failed to load workflow events.');
  }

  const { rules } = await getOrgWorkflowRules(organizationId);
  const enabledRules = (rules ?? []).filter((r) => r.enabled !== false).length;

  return {
    range: { days, since },
    queue,
    events,
    rules: {
      total: rules?.length ?? 0,
      enabled: enabledRules,
    },
    reportsHint:
      'Workflow actions are recorded as support_events (workflow.action_*). Use Reports → Overview or query support_events for trends.',
  };
}
