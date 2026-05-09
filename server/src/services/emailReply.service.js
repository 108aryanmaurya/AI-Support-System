import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

export async function getConversation(conversationId) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load conversation.');
  if (!data) throw new HttpError(404, 'Conversation not found.');
  return data;
}

/** Persists an agent outbound row (used by {@link EmailAdapter}). */
export async function persistAgentOutboundMessage({
  organizationId,
  conversationId,
  senderMemberId,
  content,
  metadata,
}) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      sender_type: 'agent',
      sender_user_id: null,
      sender_member_id: senderMemberId,
      content,
      metadata,
    })
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to store outgoing agent message.');
  return data;
}
