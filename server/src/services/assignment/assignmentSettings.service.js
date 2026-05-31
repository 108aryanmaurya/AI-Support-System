import {
  inboxScoringStrategyFromSettings,
  isInboxAutoAssignmentEnabled,
  mergeInboxSettings,
  mergeOrgAssignmentRouting,
} from '@ai-support/shared';
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
 * @deprecated Use per-inbox `assignmentMethod` via {@link loadQueueInboxSettingsForConversation}.
 */
export async function isOrgAutoRouteEnabledForOrg() {
  return false;
}

/**
 * Team queue inbox for assignment (team_inbox_id, else routing inbox_id).
 *
 * @param {string} organizationId
 * @param {string} conversationId
 */
export async function loadQueueInboxSettingsForConversation(organizationId, conversationId) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('team_inbox_id, inbox_id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load conversation.');
  }
  if (!data) {
    throw new HttpError(404, 'Conversation not found in this organization.');
  }

  const queueInboxId = data.team_inbox_id ?? data.inbox_id ?? null;
  if (!queueInboxId) {
    return { queueInboxId: null, settings: mergeInboxSettings({}) };
  }

  const { data: inbox, error: inboxErr } = await supabaseAdmin
    .from('inboxes')
    .select('settings, status')
    .eq('id', queueInboxId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (inboxErr) {
    throw new HttpError(500, inboxErr.message || 'Failed to load inbox.');
  }
  if (!inbox || inbox.status !== 'active') {
    return { queueInboxId, settings: mergeInboxSettings({}) };
  }

  return { queueInboxId, settings: mergeInboxSettings(inbox.settings) };
}

/**
 * Gates `assignment.auto_route` enqueue: org AI on + conversation queue inbox not manual.
 *
 * @param {string} organizationId
 * @param {string} [conversationId]
 */
export async function canEnqueueAutoRoute(organizationId, conversationId = null) {
  const { ai } = await getOrgAiAndAutomationSettings(organizationId);
  if (!ai.ai_enabled) {
    return { allowed: false, reason: 'ai_disabled' };
  }

  if (!conversationId) {
    return { allowed: false, reason: 'conversation_required' };
  }

  const { queueInboxId, settings } = await loadQueueInboxSettingsForConversation(
    organizationId,
    conversationId,
  );
  if (!queueInboxId) {
    return { allowed: false, reason: 'no_queue_inbox' };
  }
  if (!isInboxAutoAssignmentEnabled(settings)) {
    return { allowed: false, reason: 'inbox_manual_assignment' };
  }
  if (!inboxScoringStrategyFromSettings(settings)) {
    return { allowed: false, reason: 'inbox_manual_assignment' };
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
