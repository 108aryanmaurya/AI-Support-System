import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { scrubPii } from './utils/piiFilter.js';
import { truncateConversation } from './utils/tokenBudget.js';

const MAX_MESSAGES = 40;

const DEFAULT_STYLE_GUIDE =
  'Be professional, accurate, and concise. Do not promise refunds or policy exceptions unless clearly supported by the thread.';

/**
 * @param {string} organizationId
 */
export async function loadOrganizationPromptContext(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load organization settings.');
  }

  const settings = data?.settings && typeof data.settings === 'object' ? data.settings : {};
  const aiRaw = settings.ai && typeof settings.ai === 'object' ? settings.ai : {};
  const styleGuide =
    typeof aiRaw.style_guide === 'string' && aiRaw.style_guide.trim()
      ? aiRaw.style_guide.trim().slice(0, 2000)
      : DEFAULT_STYLE_GUIDE;

  return { styleGuide };
}

/**
 * Recent thread messages for LLM context (excludes internal notes).
 * @param {string} organizationId
 * @param {string} conversationId
 */
export async function loadConversationTranscript(organizationId, conversationId) {
  const { data: conv, error: convErr } = await supabaseAdmin
    .from('conversations')
    .select(
      'id, subject, status, channel_type, customer_id, metadata, customers(id, name, email)',
    )
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (convErr) {
    throw new HttpError(500, convErr.message || 'Failed to load conversation.');
  }
  if (!conv) {
    throw new HttpError(404, 'Conversation not found in this organization.');
  }

  const { data: rows, error } = await supabaseAdmin
    .from('messages')
    .select('id, sender_type, content, created_at')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .neq('sender_type', 'internal_note')
    .order('created_at', { ascending: false })
    .limit(MAX_MESSAGES);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load messages.');
  }

  const messages = (rows ?? []).reverse().map((m) => ({
    id: m.id,
    role: m.sender_type === 'customer' ? 'customer' : 'agent',
    senderType: m.sender_type,
    content: scrubPii(String(m.content ?? '').trim()),
    createdAt: m.created_at,
  }));

  const tags = await loadConversationTagNames(organizationId, conversationId);

  const customer = conv.customers ?? null;
  const customerName =
    typeof customer?.name === 'string' && customer.name.trim()
      ? customer.name.trim()
      : typeof customer?.email === 'string' && customer.email.trim()
        ? customer.email.trim()
        : null;

  return {
    conversation: {
      id: conv.id,
      subject: conv.subject,
      status: conv.status,
      channelType: conv.channel_type,
      metadata: conv.metadata,
    },
    customer: customer
      ? {
          id: customer.id,
          name: customerName,
          email: customer.email ?? null,
        }
      : null,
    tags,
    messages,
  };
}

/**
 * @param {string} organizationId
 * @param {string} conversationId
 * @returns {Promise<string[]>}
 */
async function loadConversationTagNames(organizationId, conversationId) {
  const { data, error } = await supabaseAdmin
    .from('conversation_tags')
    .select('tag_definitions(name)')
    .eq('conversation_id', conversationId)
    .eq('organization_id', organizationId);

  if (error) {
    if (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message?.includes('conversation_tags')
    ) {
      return [];
    }
    throw new HttpError(500, error.message || 'Failed to load conversation tags.');
  }

  return (data ?? [])
    .map((row) => row.tag_definitions?.name)
    .filter((name) => typeof name === 'string' && name.trim())
    .map((name) => name.trim())
    .slice(0, 20);
}

/**
 * Apply token budget and format transcript + metadata block for prompts.
 * @param {object} params
 * @param {Array<{ role: string, content: string }>} params.messages
 * @param {object} [params.conversation]
 * @param {object | null} [params.customer]
 * @param {string[]} [params.tags]
 */
export function buildConversationPromptBlock({
  messages,
  conversation = null,
  customer = null,
  tags = [],
}) {
  const { messages: trimmed, droppedCount, truncated } = truncateConversation(messages);

  const header = [];
  if (conversation?.channelType) {
    header.push(`Channel: ${conversation.channelType}`);
  }
  if (customer?.name) {
    header.push(`Customer: ${customer.name}`);
  } else if (customer?.email) {
    header.push(`Customer email: ${customer.email}`);
  }
  if (conversation?.subject) {
    header.push(`Subject: ${String(conversation.subject).trim()}`);
  }
  if (tags.length > 0) {
    header.push(`Tags: ${tags.join(', ')}`);
  }
  if (truncated) {
    header.push(`Note: older messages omitted (${droppedCount} dropped) to fit context limit.`);
  }

  const transcript = formatTranscriptForPrompt(trimmed);
  const parts = [];
  if (header.length) parts.push(header.join('\n'));
  if (transcript) parts.push(`Conversation:\n${transcript}`);

  return {
    promptText: parts.join('\n\n'),
    transcript,
    droppedCount,
    truncated,
  };
}

/**
 * @param {Array<{ role: string, content: string }>} messages
 */
export function formatTranscriptForPrompt(messages) {
  return messages
    .filter((m) => m.content)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');
}
