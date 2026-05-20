import { parseConversationMetadataAi } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';

/**
 * Load Phase 4 condition fields from `conversations.metadata.ai`.
 *
 * @param {string} organizationId
 * @param {string} conversationId
 */
export async function getConversationAiSignals(organizationId, conversationId) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, metadata, ai_enabled, priority, channel_id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load conversation signals.');
  }
  if (!data) {
    throw new HttpError(404, 'Conversation not found in this organization.');
  }

  return {
    conversationId: data.id,
    ai_enabled: data.ai_enabled !== false,
    priority: data.priority ?? null,
    channel_id: data.channel_id ?? null,
    classification: parseConversationMetadataAi(data.metadata),
  };
}
