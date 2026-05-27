import { hasOrgPermission } from '@ai-support/shared';
import { HttpError } from '../../utils/httpError.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { getOrgPermissionsForMember } from '../orgPermissions.service.js';
import {
  getOrgAiSettings,
  isOrgAiMasterEnabled,
} from '../orgSettings.service.js';
import { ensureOrgMembership } from '../support.service.js';
import { isLlmConfigured } from './llm.client.js';

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.actorUserId
 * @param {string | null} [params.conversationId]
 */
export async function assertAiAssistAllowed({
  organizationId,
  actorUserId,
  conversationId = null,
}) {
  if (!isLlmConfigured()) {
    throw new HttpError(
      503,
      'AI provider is not configured. Set LLM_PROVIDER and LLM_API_KEY in server environment.',
    );
  }

  const member = await ensureOrgMembership(actorUserId, organizationId);
  const permissions = await getOrgPermissionsForMember(organizationId, member);
  if (!hasOrgPermission(permissions, 'ai.use_copilot')) {
    throw new HttpError(403, 'AI copilot is not enabled for your role.');
  }

  if (!(await isOrgAiMasterEnabled(organizationId))) {
    throw new HttpError(403, 'AI is disabled for this organization.');
  }

  const ai = await getOrgAiSettings(organizationId);
  if (!ai.assist_enabled) {
    throw new HttpError(403, 'AI assist is disabled in organization settings.');
  }

  if (conversationId) {
    const { data: conv, error } = await supabaseAdmin
      .from('conversations')
      .select('id, ai_enabled')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, error.message || 'Failed to load conversation.');
    }
    if (!conv) {
      throw new HttpError(404, 'Conversation not found in this organization.');
    }
    if (conv.ai_enabled === false) {
      throw new HttpError(403, 'AI is disabled for this conversation.');
    }
  }

  return { member };
}
