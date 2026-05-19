import { resolveMentionUserIdsFromContent } from '@ai-support/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import {
  ensureOrgMembership,
  listOrganizationMembersWithProfiles,
  mergeConversationMentionUserIds,
} from './support.service.js';
import { getConversation } from './emailReply.service.js';
import { sendReplyOutbound } from './channelReplyRouter.service.js';
import { sanitizeMessage, getMaxMessageLength } from '../utils/incomingMessageValidation.js';
import {
  replaceMessageMetadataExact,
  syncEmailThreadsLastMessageId,
} from './emailOutboundDbSync.service.js';
import { emitSupportEvent } from './analytics/supportEvents.service.js';
import { recordOutboundDeliveryFailure } from './outboundDeliveryMonitor.service.js';
import {
  beginAgentSendIdempotency,
  commitAgentSendIdempotency,
  releaseAgentSendIdempotencyLock,
} from './agentSendIdempotency.service.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_MESSAGE_LENGTH = getMaxMessageLength();

async function patchConversationActivity(conversationId, organizationId, createdAtIso) {
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: createdAtIso })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (error) throw new HttpError(500, error.message || 'Failed to refresh conversation activity.');
}

/**
 * Inbox send: insert pending agent row → outbound send → mark sent/failed on same row.
 */
function parseOptionalUuidField(value, fieldName) {
  if (value == null || value === '') return null;
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return null;
  if (!UUID_V4_REGEX.test(s)) {
    throw new HttpError(400, `${fieldName} must be a valid UUID.`);
  }
  return s;
}

export async function sendInboxAgentOutboundMessage({
  userId,
  conversationId: rawConversationId,
  rawContent,
  expectedOrganizationId = null,
  clientRequestId: rawClientRequestId = null,
  isAiGenerated = false,
  aiRunId: rawAiRunId = null,
  parentMessageId: rawParentMessageId = null,
}) {
  const conversationId =
    typeof rawConversationId === 'string' ? rawConversationId.trim() : '';

  if (!conversationId) throw new HttpError(400, 'conversation_id is required.');
  if (!UUID_V4_REGEX.test(conversationId)) throw new HttpError(400, 'conversation_id must be a valid UUID.');
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

  const membersPayload = await listOrganizationMembersWithProfiles({
    organizationId: conversation.organization_id,
    actorUserId: userId,
  });
  const mentionMembers = membersPayload.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    email: m.email,
  }));
  const mentionIds = resolveMentionUserIdsFromContent(body, mentionMembers);

  const aiGenerated = isAiGenerated === true;
  const resolvedAiRunId = parseOptionalUuidField(rawAiRunId, 'ai_run_id');
  const resolvedParentMessageId = parseOptionalUuidField(
    rawParentMessageId,
    'parent_message_id',
  );

  if (aiGenerated && !resolvedAiRunId) {
    throw new HttpError(400, 'ai_run_id is required when is_ai_generated is true.');
  }

  if (resolvedAiRunId) {
    const { data: run, error: runErr } = await supabaseAdmin
      .from('ai_runs')
      .select('id')
      .eq('id', resolvedAiRunId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (runErr) throw new HttpError(500, runErr.message || 'Failed to validate AI run.');
    if (!run) throw new HttpError(404, 'AI run not found in this organization.');
  }

  if (resolvedParentMessageId) {
    const { data: parentMsg, error: parentErr } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('id', resolvedParentMessageId)
      .eq('conversation_id', conversation.id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (parentErr) {
      throw new HttpError(500, parentErr.message || 'Failed to validate parent message.');
    }
    if (!parentMsg) {
      throw new HttpError(404, 'parent_message_id not found in this conversation.');
    }
  }

  const initialMetadata = {
    status: 'pending',
    ...(activeClientRequestId ? { client_request_id: activeClientRequestId } : {}),
    ...(mentionIds.length ? { mentions: mentionIds } : {}),
  };

  let inserted;
  try {
    const { data: row, error: insertError } = await supabaseAdmin
    .from('messages')
    .insert({
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      sender_type: 'agent',
      sender_user_id: userId,
      sender_member_id: member.id,
      content: body,
      metadata: initialMetadata,
      is_ai_generated: aiGenerated,
      ai_run_id: resolvedAiRunId,
      parent_message_id: resolvedParentMessageId,
    })
      .select('*')
      .single();

    if (insertError) {
      if (insertError.code === '23514') throw new HttpError(400, insertError.message || 'Message validation failed.');
      throw new HttpError(500, insertError.message || 'Failed to create message.');
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
      organizationId: conversation.organization_id,
      conversationId: conversation.id,
      userIds: mentionIds,
    });
  }

  try {
    const outbound = await sendReplyOutbound(conversation.id, body);

    let updated;
    if (conversation.channel_type === 'email') {
      const externalId =
        outbound.providerMessageId != null ? String(outbound.providerMessageId) : null;
      updated = await replaceMessageMetadataExact({
        organizationId: conversation.organization_id,
        messageId: inserted.id,
        metadata: {
          ...(inserted.metadata && typeof inserted.metadata === 'object' ? inserted.metadata : {}),
          status: 'sent',
          external_message_id: externalId,
          channel: 'email',
        },
      });

      await syncEmailThreadsLastMessageId({
        organizationId: conversation.organization_id,
        conversationId: conversation.id,
        messageId: inserted.id,
      });
    } else {
      updated = await replaceMessageMetadataExact({
        organizationId: conversation.organization_id,
        messageId: inserted.id,
        metadata: {
          ...(inserted.metadata && typeof inserted.metadata === 'object' ? inserted.metadata : {}),
          status: 'sent',
          channel: conversation.channel_type,
        },
      });
    }

    await patchConversationActivity(conversation.id, conversation.organization_id, updated.created_at);

    emitSupportEvent({
      organizationId: conversation.organization_id,
      eventType: 'message.outbound_sent',
      entityType: 'message',
      entityId: updated.id,
      actorMemberId: member.id,
      channelType: conversation.channel_type ?? null,
      payload: {
        conversation_id: conversation.id,
        sender_type: 'agent',
      },
    });

    const successPayload = {
      message: updated,
      outbound,
      deliveryStatus: 'sent',
    };

    await commitAgentSendIdempotency({
      organizationId,
      clientRequestId: activeClientRequestId,
      conversationId: conversation.id,
      messageId: updated.id,
      result: successPayload,
    });

    return successPayload;
  } catch (err) {
    await replaceMessageMetadataExact({
      organizationId: conversation.organization_id,
      messageId: inserted.id,
      metadata: {
        ...(inserted.metadata && typeof inserted.metadata === 'object' ? inserted.metadata : {}),
        status: 'failed',
      },
    });

    void recordOutboundDeliveryFailure({
      organizationId: conversation.organization_id,
      conversationId: conversation.id,
      messageId: inserted.id,
      channelType: conversation.channel_type ?? null,
      actorMemberId: member.id,
      senderType: 'agent',
      err,
    });

    const { data: failedRow } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('id', inserted.id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    const failedPayload = {
      message: failedRow ?? inserted,
      deliveryStatus: 'failed',
      idempotentReplay: false,
    };

    await commitAgentSendIdempotency({
      organizationId,
      clientRequestId: activeClientRequestId,
      conversationId: conversation.id,
      messageId: inserted.id,
      result: failedPayload,
    });

    throw err;
  }
}
