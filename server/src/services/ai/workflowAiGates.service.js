import { getOrgAiSettings, isOrgAiMasterEnabled } from '../orgSettings.service.js';
import { HttpError } from '../../utils/httpError.js';
import { supabaseAdmin } from '../../config/supabase.js';

/**
 * Whether Phase 4 workflow jobs may run for this org.
 *
 * @param {string} organizationId
 */
export async function isWorkflowAutomationEnabled(organizationId) {
  if (!(await isOrgAiMasterEnabled(organizationId))) return false;
  const ai = await getOrgAiSettings(organizationId);
  return Boolean(ai.workflow_automation_enabled);
}

/**
 * Phase 6 gate: customer-visible autonomous AI sends (not available in Phase 4).
 *
 * @param {string} organizationId
 */
export async function isPhase6AutonomousSendEnabled(organizationId) {
  if (!(await isOrgAiMasterEnabled(organizationId))) return false;
  const ai = await getOrgAiSettings(organizationId);
  return Boolean(ai.autonomous_replies_enabled);
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} [params.conversationId] — when set, loads `ai_enabled` from DB
 * @param {boolean} [params.conversationAiEnabled] — skip DB when caller already has it
 */
export async function canAssignConversationToAi({
  organizationId,
  conversationId,
  conversationAiEnabled,
}) {
  if (!(await isOrgAiMasterEnabled(organizationId))) {
    return { allowed: false, reason: 'org_ai_disabled' };
  }

  let aiEnabled = conversationAiEnabled;
  if (typeof aiEnabled !== 'boolean' && conversationId) {
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('ai_enabled')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    aiEnabled = conv?.ai_enabled !== false;
  }

  if (aiEnabled === false) {
    return { allowed: false, reason: 'conversation_ai_disabled' };
  }

  return { allowed: true };
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} [params.conversationId]
 * @param {boolean} [params.conversationAiEnabled]
 */
export async function assertCanAssignConversationToAi(params) {
  const result = await canAssignConversationToAi(params);
  if (result.allowed) return;

  if (result.reason === 'org_ai_disabled') {
    throw new HttpError(400, 'AI is disabled for this organization.');
  }
  throw new HttpError(400, 'Cannot assign to AI when conversation AI is disabled.');
}
