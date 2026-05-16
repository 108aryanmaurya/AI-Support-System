import { supabaseAdmin } from '../../config/supabase.js';
import { randomUUID } from 'node:crypto';

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;

/**
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
export async function claimPendingAutomationJobs(limit = 10) {
  const { data, error } = await supabaseAdmin.rpc('claim_automation_jobs', {
    p_worker_id: WORKER_ID,
    p_limit: limit,
  });

  if (error) {
    const missing =
      error.message?.includes('claim_automation_jobs') ||
      error.code === 'PGRST202' ||
      error.code === '42883';
    if (missing) return [];
    throw new Error(error.message || 'Failed to claim automation jobs');
  }

  return Array.isArray(data) ? data : [];
}
