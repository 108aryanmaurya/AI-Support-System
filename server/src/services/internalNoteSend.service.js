import { resolveMentionUserIdsFromContent } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { getOrgPermissionsForMember } from './orgPermissions.service.js';
import {
  ensureOrgMembership,
  listOrganizationMembersWithProfiles,
  mergeConversationMentionUserIds,
} from './support.service.js';
import { getConversation } from './emailReply.service.js';
import { sanitizeMessage, getMaxMessageLength } from '../utils/incomingMessageValidation.js';
import {
  beginAgentSendIdempotency,
  commitAgentSendIdempotency,
  releaseAgentSendIdempotencyLock,
} from './agentSendIdempotency.service.js';
import { assertCanPostInternalNote } from './mentionNotification.service.js';
import { assertCanAccessConversation } from './inboxAccess.service.js';
import { scheduleMentionNotifications } from './automation/automationNotify.service.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_MESSAGE_LENGTH = getMaxMessageLength();

async function touchConversationActivity(conversationId, organizationId, createdAtIso) {
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: createdAtIso })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to refresh conversation activity.');
  }
}

/**
 * Agent-only internal note on a conversation (no customer outbound). Parses @mentions,
 * updates conversation metadata, enqueues mention emails.
 */
export async function sendInternalNoteMessage({
  userId,
  conversationId: rawConversationId,
  rawContent,
  expectedOrganizationId = null,
  clientRequestId: rawClientRequestId = null,
}) {
  const conversationId =
    typeof rawConversationId === 'string' ? rawConversationId.trim() : '';

  if (!conversationId) throw new HttpError(400, 'conversation_id is required.');
  if (!UUID_V4_REGEX.test(conversationId)) {
    throw new HttpError(400, 'conversation_id must be a valid UUID.');
  }
  if (typeof rawContent !== 'string') throw new HttpError(400, 'content is required.');

  const body = sanitizeMessage(rawContent);
  if (!body) throw new HttpError(400, 'content cannot be empty.');
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new HttpError(400, `content exceeds max length of ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const conversation = await getConversation(conversationId);

  if (
    expectedOrganizationId != null &&
    conversation.organization_id !== expectedOrganizationId
  ) {
    throw new HttpError(403, 'Conversation does not belong to this organization.');
  }

  const organizationId = conversation.organization_id;

  const idempotency = await beginAgentSendIdempotency({
    organizationId,
    clientRequestId: rawClientRequestId,
    conversationId,
  });

  if (idempotency.mode === 'replay') {
    return idempotency.result;
  }

  const activeClientRequestId =
    idempotency.mode === 'proceed' ? idempotency.clientRequestId : null;

  const member = await ensureOrgMembership(userId, organizationId);
  const permissions = await getOrgPermissionsForMember(organizationId, member);
  await assertCanAccessConversation({
    organizationId,
    conversationId,
    membership: member,
    orgPermissions: permissions,
  });
  assertCanPostInternalNote(permissions);

  const membersPayload = await listOrganizationMembersWithProfiles({
    organizationId,
    actorUserId: userId,
  });
  const mentionMembers = membersPayload.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    email: m.email,
  }));
  const mentionIds = resolveMentionUserIdsFromContent(body, mentionMembers);

  const metadata = {
    status: 'sent',
    delivery_status: 'sent',
    ...(activeClientRequestId ? { client_request_id: activeClientRequestId } : {}),
    ...(mentionIds.length ? { mentions: mentionIds } : {}),
  };

  let inserted;
  try {
    const { data: row, error: insertError } = await supabaseAdmin
      .from('messages')
      .insert({
        organization_id: organizationId,
        conversation_id: conversation.id,
        sender_type: 'internal_note',
        sender_user_id: userId,
        sender_member_id: member.id,
        content: body,
        metadata,
      })
      .select('*')
      .single();

    if (insertError) {
      if (insertError.code === '23514') {
        throw new HttpError(400, insertError.message || 'Message validation failed.');
      }
      throw new HttpError(500, insertError.message || 'Failed to create internal note.');
    }
    inserted = row;
  } catch (e) {
    await releaseAgentSendIdempotencyLock({
      organizationId,
      clientRequestId: activeClientRequestId,
    });
    throw e;
  }

  if (mentionIds.length) {
    await mergeConversationMentionUserIds({
      organizationId,
      conversationId: conversation.id,
      userIds: mentionIds,
    });
  }

  await touchConversationActivity(conversation.id, organizationId, inserted.created_at);

  if (mentionIds.length) {
    scheduleMentionNotifications({
      organizationId,
      conversationId: conversation.id,
      messageId: inserted.id,
      actorUserId: userId,
      mentionedUserIds: mentionIds,
      noteSnippet: body,
    });
  }

  const successPayload = {
    message: inserted,
    deliveryStatus: 'sent',
    mentionedUserIds: mentionIds,
  };

  await commitAgentSendIdempotency({
    organizationId,
    clientRequestId: activeClientRequestId,
    conversationId: conversation.id,
    messageId: inserted.id,
    result: successPayload,
  });

  return successPayload;
}
