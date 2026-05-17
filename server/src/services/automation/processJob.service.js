import { supabaseAdmin } from '../../config/supabase.js';
import { handleNotifyAssignment } from './jobHandlers/notifyAssignment.js';
import { handleNotifyStaffInbound } from './jobHandlers/notifyStaffInbound.js';
import { handleSlaScanOrg } from './jobHandlers/slaScanOrg.js';
import { handleKnowledgeIngestSource } from './jobHandlers/knowledgeIngestSource.js';

const HANDLERS = {
  'notify.staff_inbound': handleNotifyStaffInbound,
  'notify.assignment': handleNotifyAssignment,
  'sla.scan_org': handleSlaScanOrg,
  'knowledge.ingest_source': handleKnowledgeIngestSource,
};

function backoffSeconds(attempts) {
  return Math.min(900, 30 * 2 ** Math.max(0, attempts - 1));
}

async function markJobCompleted(jobId) {
  await supabaseAdmin
    .from('automation_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: null,
    })
    .eq('id', jobId);
}

async function markJobFailed(job, errorMessage) {
  const attempts = job.attempts ?? 1;
  const max = job.max_attempts ?? 5;
  const dead = attempts >= max;

  const patch = {
    status: dead ? 'dead' : 'pending',
    last_error: errorMessage?.slice(0, 2000) ?? 'unknown_error',
    locked_at: null,
    locked_by: null,
  };

  if (!dead) {
    const runAt = new Date(Date.now() + backoffSeconds(attempts) * 1000);
    patch.run_at = runAt.toISOString();
  }

  await supabaseAdmin.from('automation_jobs').update(patch).eq('id', job.id);
}

/**
 * Run handler for a claimed job row.
 * @param {object} job — full automation_jobs row
 */
export async function runAutomationJob(job) {
  const handler = HANDLERS[job.job_type];
  if (!handler) {
    throw new Error(`No handler for job_type: ${job.job_type}`);
  }
  await handler(job);
}

/**
 * Load and process one job by id (inline mode).
 */
export async function processAutomationJobById(jobId) {
  const { data: job, error } = await supabaseAdmin
    .from('automation_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error || !job) return;

  if (job.status === 'completed') return;

  await supabaseAdmin
    .from('automation_jobs')
    .update({
      status: 'processing',
      locked_at: new Date().toISOString(),
      locked_by: 'inline',
      attempts: (job.attempts ?? 0) + 1,
    })
    .eq('id', jobId);

  try {
    await runAutomationJob(job);
    await markJobCompleted(jobId);
  } catch (e) {
    await markJobFailed(
      { ...job, attempts: (job.attempts ?? 0) + 1, max_attempts: job.max_attempts },
      e?.message ?? String(e),
    );
    throw e;
  }
}

/**
 * Process jobs returned from claim_automation_jobs RPC.
 * @param {object[]} jobs
 */
export async function processClaimedJobs(jobs) {
  let ok = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await runAutomationJob(job);
      await markJobCompleted(job.id);
      ok += 1;
    } catch (e) {
      const message = e?.message ?? String(e);
      await markJobFailed(job, message);
      failed += 1;
      // eslint-disable-next-line no-console
      console.error('[automation] job failed', {
        jobId: job.id,
        jobType: job.job_type,
        organizationId: job.organization_id,
        attempts: job.attempts,
        message,
      });
    }
  }

  return { ok, failed };
}
