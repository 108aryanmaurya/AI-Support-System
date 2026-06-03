import { CONVERSATION_TERMINAL_STATUSES, isConversationTerminalStatus } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { createConversation } from '../support.service.js';
import {
  findActiveWebConversation,
  findLatestTerminalWebConversation,
  reopenConversation,
  shouldReopenConversation,
} from '../lifecycle/conversationLifecycle.service.js';
import { getOrgLifecycleSettings } from '../lifecycle/lifecycleSettings.service.js';
import { ensureWebChannelForOrg } from './widgetChannel.service.js';
import { ensureVisitorCustomer } from './widgetCustomer.service.js';
import { updateSessionConversationId } from './widgetSession.service.js';

/**
 * @param {object} params
 */
async function assertVisitorOwnsConversation({ organizationId, conversationId, customerId }) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, customer_id, organization_id, channel_type, status')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load conversation.');
  if (!data || data.customer_id !== customerId) {
    throw new HttpError(404, 'Conversation not found.');
  }
  if (data.channel_type !== 'web') {
    throw new HttpError(400, 'Conversation is not a web channel thread.');
  }
  return data;
}

export async function listVisitorConversations({
  organizationId,
  customerId,
  limit = 20,
  cursor = null,
}) {
  let query = supabaseAdmin
    .from('conversations')
    .select('id, status, subject, last_message_at, created_at, metadata')
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId)
    .eq('channel_type', 'web')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(Math.min(limit, 50));

  if (cursor) {
    query = query.lt('last_message_at', cursor);
  }

  const { data, error } = await query;
  if (error) throw new HttpError(500, error.message || 'Failed to list conversations.');
  return data ?? [];
}

export async function createVisitorConversation({
  organizationId,
  visitor,
  installation,
  sessionId,
  subject = null,
}) {
  const { customerId } = await ensureVisitorCustomer({
    organizationId,
    visitor,
  });

  const channelId = await ensureWebChannelForOrg(organizationId);

  const conversation = await createConversation({
    organizationId,
    customerId,
    assignedToMemberId: null,
    source: 'chat',
    channelType: 'web',
    channelId,
    metadata: {
      source: 'widget',
      widget_installation_id: installation.id,
      widget_visitor_id: visitor.id,
    },
    subject: subject || 'Web chat',
  });

  await updateSessionConversationId(sessionId, conversation.id);

  return conversation;
}

export async function resolveActiveConversationForVisitor({
  organizationId,
  visitor,
  installation,
  sessionId,
}) {
  const { customerId, visitor: linkedVisitor } = await ensureVisitorCustomer({
    organizationId,
    visitor,
  });

  const active = await findActiveWebConversation({
    organizationId,
    customerId,
  });
  if (active) {
    await updateSessionConversationId(sessionId, active.id);
    return active;
  }

  return createVisitorConversation({
    organizationId,
    visitor: linkedVisitor,
    installation,
    sessionId,
  });
}

export async function getVisitorConversation({
  organizationId,
  conversationId,
  customerId,
}) {
  return assertVisitorOwnsConversation({ organizationId, conversationId, customerId });
}

export async function prepareConversationForCustomerMessage({
  organizationId,
  conversationId,
  customerId,
}) {
  const conversation = await assertVisitorOwnsConversation({
    organizationId,
    conversationId,
    customerId,
  });

  if (!isConversationTerminalStatus(conversation.status)) {
    return conversation;
  }

  const lifecycle = await getOrgLifecycleSettings(organizationId);
  const terminal = await findLatestTerminalWebConversation({
    organizationId,
    customerId,
  });

  if (
    terminal?.id === conversationId &&
    shouldReopenConversation({
      conversation: terminal,
      channel: 'web',
      payload: {},
      orgSettings: lifecycle,
    })
  ) {
    await reopenConversation({
      organizationId,
      conversationId,
      reason: 'customer_reply_widget',
      channel: 'web',
    });
    const { data: reopened } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();
    return reopened;
  }

  if (CONVERSATION_TERMINAL_STATUSES.includes(conversation.status)) {
    throw new HttpError(400, 'Conversation is closed. Start a new conversation.');
  }

  return conversation;
}
