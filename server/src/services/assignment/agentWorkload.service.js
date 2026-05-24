import { CONVERSATION_ACTIVE_STATUSES } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { getActiveChatsFromRedis, setActiveChatsInRedis } from './assignmentRedis.service.js';
import { getAgentAssignmentConfig } from './agentProfile.service.js';

/**
 * Conversation row counts toward agent workload.
 *
 * @param {object} conv
 */
export function conversationCountsTowardWorkload(conv) {
  if (!conv?.assigned_to_member_id) return false;
  if (conv.assignment_type && conv.assignment_type !== 'assigned_to_agent') return false;
  const status = conv.status ?? 'open';
  return CONVERSATION_ACTIVE_STATUSES.includes(status);
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 */
export async function countActiveAssignedConversations(organizationId, memberId) {
  const { count, error } = await supabaseAdmin
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('assigned_to_member_id', memberId)
    .eq('assignment_type', 'assigned_to_agent')
    .in('status', [...CONVERSATION_ACTIVE_STATUSES]);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[assignment_workload] count failed', {
      organization_id: organizationId,
      member_id: memberId,
      message: error.message,
    });
    return null;
  }
  return count ?? 0;
}

/**
 * DB count → Redis cache.
 *
 * @param {string} organizationId
 * @param {string} memberId
 */
export async function syncActiveChatsFromDb(organizationId, memberId) {
  const count = await countActiveAssignedConversations(organizationId, memberId);
  if (count === null) return null;
  await setActiveChatsInRedis(organizationId, memberId, count);
  return count;
}

/**
 * After conversation assignment/status update, refresh workload for affected assignees.
 *
 * @param {string} organizationId
 * @param {object} prior
 * @param {object} data
 */
export async function syncWorkloadOnConversationUpdate(organizationId, prior, data) {
  const members = new Set();
  if (prior?.assigned_to_member_id) members.add(prior.assigned_to_member_id);
  if (data?.assigned_to_member_id) members.add(data.assigned_to_member_id);

  const assignmentChanged =
    prior?.assigned_to_member_id !== data?.assigned_to_member_id ||
    prior?.assignment_type !== data?.assignment_type;
  const statusChanged = prior?.status !== data?.status;

  if (!assignmentChanged && !statusChanged) return;

  await Promise.all(
    [...members].map((memberId) => syncActiveChatsFromDb(organizationId, memberId)),
  );
}

/**
 * Whether member has capacity for another active assignment (Sprint 3+ scoring gate).
 *
 * @param {string} organizationId
 * @param {string} memberId
 */
export async function memberHasConcurrencyCapacity(organizationId, memberId) {
  let config;
  try {
    config = await getAgentAssignmentConfig(organizationId, memberId);
  } catch {
    return { allowed: false, reason: 'member_not_found', activeChats: null, maxConcurrency: null };
  }

  const maxConcurrency = config.profile?.maxConcurrency ?? 5;
  if (config.profile?.status === 'inactive') {
    return { allowed: false, reason: 'agent_inactive', activeChats: null, maxConcurrency };
  }

  let activeChats = await getActiveChatsFromRedis(organizationId, memberId);
  if (activeChats === null) {
    activeChats = await syncActiveChatsFromDb(organizationId, memberId);
  }
  if (activeChats === null) {
    activeChats = await countActiveAssignedConversations(organizationId, memberId);
  }

  const chats = activeChats ?? 0;
  if (chats >= maxConcurrency) {
    return { allowed: false, reason: 'at_concurrency_limit', activeChats: chats, maxConcurrency };
  }
  return { allowed: true, activeChats: chats, maxConcurrency };
}
