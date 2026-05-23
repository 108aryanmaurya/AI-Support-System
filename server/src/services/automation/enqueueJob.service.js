import { isAutomationJobType, isWorkflowAutomationJobType } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { getOrgAutomationSettings } from './orgAutomationSettings.service.js';
import { getOrgAiSettings } from '../orgSettings.service.js';
import { processAutomationJobById } from './processJob.service.js';

function isJobTypeAllowedBySettings(jobType, automationSettings, aiSettings) {
  if (jobType === 'notify.staff_inbound') return automationSettings.inbound_notify_enabled;
  if (jobType === 'notify.sla_warning') {
    return automationSettings.sla_enabled && automationSettings.inbound_notify_enabled;
  }
  if (jobType === 'notify.assignment') return automationSettings.assignment_notify_enabled;
  if (jobType === 'sla.scan_org') return automationSettings.sla_enabled;
  if (isWorkflowAutomationJobType(jobType)) {
    return Boolean(aiSettings.ai_enabled && aiSettings.workflow_automation_enabled);
  }
  return true;
}

/**
 * Enqueue a durable automation job (idempotent when `idempotencyKey` is set).
 *
 * @returns {Promise<{ jobId: string | null, skipped: boolean, reason?: string }>}
 */
export async function enqueueAutomationJob({
  organizationId,
  jobType,
  payload = {},
  runAt = null,
  idempotencyKey = null,
  maxAttempts = 5,
}) {
  if (!organizationId || !jobType) {
    return { jobId: null, skipped: true, reason: 'missing_org_or_type' };
  }
  if (!isAutomationJobType(jobType)) {
    // eslint-disable-next-line no-console
    console.warn('[automation] unknown job_type:', jobType);
    return { jobId: null, skipped: true, reason: 'unknown_job_type' };
  }

  let automationSettings;
  let aiSettings;
  try {
    automationSettings = await getOrgAutomationSettings(organizationId);
    aiSettings = await getOrgAiSettings(organizationId);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[automation] settings load failed', e?.message);
    automationSettings = {
      inbound_notify_enabled: true,
      assignment_notify_enabled: true,
      sla_enabled: true,
    };
    aiSettings = { ai_enabled: false, workflow_automation_enabled: false };
  }

  if (!isJobTypeAllowedBySettings(jobType, automationSettings, aiSettings)) {
    return { jobId: null, skipped: true, reason: 'disabled_by_org_settings' };
  }

  const row = {
    organization_id: organizationId,
    job_type: jobType,
    payload: payload && typeof payload === 'object' ? payload : {},
    status: 'pending',
    run_at: runAt ? new Date(runAt).toISOString() : new Date().toISOString(),
    max_attempts: maxAttempts,
    idempotency_key: idempotencyKey,
  };

  if (idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from('automation_jobs')
      .select('id, status')
      .eq('organization_id', organizationId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing?.id) {
      return { jobId: existing.id, skipped: existing.status === 'completed' };
    }
  }

  const { data, error } = await supabaseAdmin
    .from('automation_jobs')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505' && idempotencyKey) {
      const { data: dup } = await supabaseAdmin
        .from('automation_jobs')
        .select('id, status')
        .eq('organization_id', organizationId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      return { jobId: dup?.id ?? null, skipped: dup?.status === 'completed' };
    }

    const missingTable =
      error.message?.includes('automation_jobs') ||
      error.code === '42P01' ||
      error.code === 'PGRST205';
    if (missingTable) {
      return { jobId: null, skipped: true, reason: 'automation_table_missing' };
    }
    // eslint-disable-next-line no-console
    console.error('[automation] enqueue failed', error.message);
    return { jobId: null, skipped: true, reason: 'enqueue_error' };
  }

  const jobId = data?.id ?? null;

  if (process.env.AUTOMATION_PROCESS_INLINE === 'true' && jobId) {
    try {
      await processAutomationJobById(jobId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[automation] inline process failed', e?.message);
    }
  }

  return { jobId, skipped: false };
}

/** Fire-and-forget enqueue. */
export function emitAutomationJob(params) {
  void enqueueAutomationJob(params).catch(() => {});
}
