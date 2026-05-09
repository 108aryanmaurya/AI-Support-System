import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Point `email_threads.last_message_id` at the outbound `messages.id` UUID (FK).
 * RFC / Resend outbound ids belong in message metadata as `external_message_id`.
 */
export async function syncEmailThreadsLastMessageId({
  organizationId,
  conversationId,
  messageId,
}) {
  const { error } = await supabaseAdmin
    .from('email_threads')
    .update({ last_message_id: messageId })
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId);

  if (error) throw new HttpError(500, error.message || 'Failed to sync email_threads.last_message_id.');
}

export async function replaceMessageMetadataExact({ organizationId, messageId, metadata }) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .update({ metadata })
    .eq('id', messageId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to update message metadata.');
  return data;
}
