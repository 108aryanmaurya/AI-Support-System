import {
  mergeOrgAiSettings,
  mergeOrgAutomationSettings,
} from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

async function loadSettingsRow(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, settings')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    const missing =
      error.message?.includes('settings') || error.code === '42703' || error.code === 'PGRST204';
    if (missing) {
      return { id: organizationId, settings: {} };
    }
    throw new HttpError(500, error.message || 'Failed to load organization settings.');
  }
  if (!data) {
    throw new HttpError(404, 'Organization not found.');
  }
  return data;
}

/**
 * @param {string} organizationId
 */
export async function getOrgAiSettings(organizationId) {
  const row = await loadSettingsRow(organizationId);
  const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  return mergeOrgAiSettings(settings.ai);
}

/**
 * @param {string} organizationId
 */
export async function getOrgAutomationSettings(organizationId) {
  const row = await loadSettingsRow(organizationId);
  const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  return mergeOrgAutomationSettings(settings.automation);
}

/**
 * @param {string} organizationId
 */
export async function getOrgAiAndAutomationSettings(organizationId) {
  const row = await loadSettingsRow(organizationId);
  const settings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  return {
    ai: mergeOrgAiSettings(settings.ai),
    automation: mergeOrgAutomationSettings(settings.automation),
  };
}

/**
 * Deep-merge `organizations.settings` and persist.
 * @param {string} organizationId
 * @param {{ ai?: Record<string, unknown>, automation?: Record<string, unknown> }} patch
 */
export async function patchOrgSettings(organizationId, patch = {}) {
  const row = await loadSettingsRow(organizationId);
  const prior =
    row.settings && typeof row.settings === 'object' ? { ...row.settings } : {};

  const next = { ...prior };

  if (patch.ai && typeof patch.ai === 'object') {
    next.ai = { ...(prior.ai && typeof prior.ai === 'object' ? prior.ai : {}), ...patch.ai };
  }
  if (patch.automation && typeof patch.automation === 'object') {
    next.automation = {
      ...(prior.automation && typeof prior.automation === 'object' ? prior.automation : {}),
      ...patch.automation,
    };
  }

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ settings: next })
    .eq('id', organizationId);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to save organization settings.');
  }

  return {
    ai: mergeOrgAiSettings(next.ai),
    automation: mergeOrgAutomationSettings(next.automation),
  };
}

/** Whether org allows AI features (master switch). */
export async function isOrgAiMasterEnabled(organizationId) {
  const ai = await getOrgAiSettings(organizationId);
  return Boolean(ai.ai_enabled);
}

/** Default `conversations.ai_enabled` for new conversations. */
export async function getDefaultConversationAiEnabled(organizationId) {
  const ai = await getOrgAiSettings(organizationId);
  if (!ai.ai_enabled) return false;
  return Boolean(ai.default_conversation_ai_enabled);
}
