import { mergeOrgAssignmentRouting } from '@ai-support/shared';
import { getOrgAiAndAutomationSettings } from '../orgSettings.service.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';

/**
 * @param {string} organizationId
 */
export async function getOrgAssignmentSettings(organizationId) {
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
 * Whether intelligent auto-route may run for this org (Sprint 5+ job gate).
 * Does not imply classify/workflow are enabled — callers combine with AI/workflow flags.
 *
 * @param {string} organizationId
 */
export async function isOrgAutoRouteEnabledForOrg(organizationId) {
  const assignment = await getOrgAssignmentSettings(organizationId);
  return Boolean(assignment.auto_route_enabled);
}

/**
 * Combined gates for future `assignment.auto_route` enqueue (Sprint 5).
 *
 * @param {string} organizationId
 */
export async function canEnqueueAutoRoute(organizationId) {
  const [{ ai }, assignment] = await Promise.all([
    getOrgAiAndAutomationSettings(organizationId),
    getOrgAssignmentSettings(organizationId),
  ]);
  if (!assignment.auto_route_enabled) {
    return { allowed: false, reason: 'auto_route_disabled' };
  }
  if (!ai.ai_enabled) {
    return { allowed: false, reason: 'ai_disabled' };
  }
  return { allowed: true };
}

/**
 * Gate for `assignment.reassign` jobs (Sprint 6+).
 *
 * @param {string} organizationId
 */
export async function canEnqueueReassign(organizationId) {
  const assignment = await getOrgAssignmentSettings(organizationId);
  if (!assignment.reassign_enabled) {
    return { allowed: false, reason: 'reassign_disabled' };
  }
  return { allowed: true };
}
