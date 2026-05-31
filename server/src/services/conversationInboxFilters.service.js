import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { ensureOrgMembership } from './support.service.js';
import { CONVERSATION_ACTIVE_STATUSES, isClassificationIntent } from '@ai-support/shared';

/** Sidebar / inbox filter keys — primary + dropdown scopes. */
export const CONVERSATION_INBOX_FILTER_TYPES = Object.freeze([
  'inbox',
  'mentions',
  'created_by',
  'created_by_you',
  'unassigned',
  'spam',
  'team_inbox',
  'teammate',
  'channel',
  'all',
  'sla_risk',
  'ingress_spam',
  'ai_intent',
  'closed',
  'resolved',
  'waiting_customer',
  'waiting_agent',
]);

/**
 * @param {string} filterType
 */
export function normalizeConversationFilterType(filterType) {
  const f = String(filterType ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (f === 'created_by_you') return 'created_by';
  return f;
}

/**
 * Whether non-spam-only filters should add `is_spam = false`.
 */
export function shouldExcludeSpam(filterType, includeSpam) {
  const ft = normalizeConversationFilterType(filterType);
  if (ft === 'spam') return false;
  if (ft === 'all' && includeSpam) return false;
  return true;
}

/**
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} query
 * @param {object} options
 */
export function applyConversationFilters(query, options) {
  const {
    filterType: rawFilterType,
    organizationId,
    scopeInboxId = null,
    currentUserId,
    memberId = null,
    assigneeMemberId = null,
    channelId = null,
    includeSpam = false,
    aiIntent = null,
  } = options;

  const filterType = normalizeConversationFilterType(rawFilterType);

  if (!CONVERSATION_INBOX_FILTER_TYPES.includes(filterType)) {
    throw new HttpError(400, `Unknown filterType. Use one of: ${CONVERSATION_INBOX_FILTER_TYPES.join(', ')}.`);
  }

  let q = query.eq('organization_id', organizationId);

  if (filterType === 'team_inbox' && scopeInboxId) {
    q = q.eq('team_inbox_id', scopeInboxId);
  }

  if (shouldExcludeSpam(filterType, includeSpam)) {
    q = q.eq('is_spam', false).neq('status', 'spam');
  }

  switch (filterType) {
    case 'inbox': {
      if (!memberId) {
        throw new HttpError(400, 'memberId is required for the inbox filter.');
      }
      q = q.eq('assigned_to_member_id', memberId).in('status', [...CONVERSATION_ACTIVE_STATUSES]);
      break;
    }
    case 'mentions':
      throw new HttpError(
        500,
        'mentions filter is applied via RPC (conversation_ids_mentioning_user); do not use applyConversationFilters.',
      );
    case 'created_by':
      q = q.eq('created_by', currentUserId);
      break;
    case 'all':
      break;
    case 'unassigned':
      q = q
        .is('assigned_to_member_id', null)
        .is('team_inbox_id', null)
        .in('status', [...CONVERSATION_ACTIVE_STATUSES]);
      break;
    case 'spam':
      q = q.or('status.eq.spam,is_spam.eq.true');
      break;
    case 'team_inbox':
      break;
    case 'teammate': {
      if (!assigneeMemberId) {
        throw new HttpError(400, 'memberId is required for the teammate filter.');
      }
      q = q.eq('assigned_to_member_id', assigneeMemberId).in('status', [...CONVERSATION_ACTIVE_STATUSES]);
      break;
    }
    case 'channel': {
      if (!channelId) {
        throw new HttpError(400, 'channelId is required for the channel filter.');
      }
      q = q.eq('channel_id', channelId);
      break;
    }
    case 'sla_risk':
      q = q.eq('metadata->ingress->>sla_at_risk', 'true');
      break;
    case 'ingress_spam':
      q = q.eq('metadata->ingress->>spam_suspected', 'true');
      break;
    case 'ai_intent': {
      if (!aiIntent || !isClassificationIntent(aiIntent)) {
        throw new HttpError(400, 'aiIntent query param is required for ai_intent filter.');
      }
      q = q.eq('metadata->ai->>intent', aiIntent);
      break;
    }
    case 'closed':
      q = q.eq('status', 'closed');
      break;
    case 'resolved':
      q = q.eq('status', 'resolved');
      break;
    case 'waiting_customer':
      q = q.eq('waiting_status', 'waiting_customer').in('status', [...CONVERSATION_ACTIVE_STATUSES]);
      break;
    case 'waiting_agent':
      q = q.eq('waiting_status', 'waiting_agent').in('status', [...CONVERSATION_ACTIVE_STATUSES]);
      break;
    default:
      throw new HttpError(400, `Unknown filterType: ${filterType}`);
  }

  return q;
}

/**
 * @param {object} params
 */
export async function getConversationFilterCounts({ currentUserId, organizationId }) {
  if (!currentUserId) {
    throw new HttpError(400, 'currentUserId is required.');
  }
  if (!organizationId) {
    throw new HttpError(400, 'organizationId is required.');
  }

  const membership = await ensureOrgMembership(currentUserId, organizationId);
  const memberId = membership.id;

  const countOne = async (filterType, includeSpam = false) => {
    const ft = normalizeConversationFilterType(filterType);
    if (ft === 'mentions') {
      const { data, error } = await supabaseAdmin.rpc('count_conversations_mentioning_user', {
        p_organization_id: organizationId,
        p_user_id: currentUserId,
      });
      if (error) throw new HttpError(500, error.message || 'Failed to count mention conversations.');
      const n = typeof data === 'number' ? data : Number(data ?? 0);
      return Number.isFinite(n) ? n : 0;
    }

    let q = supabaseAdmin.from('conversations').select('*', { count: 'exact', head: true });
    q = applyConversationFilters(q, {
      filterType: ft,
      organizationId,
      scopeInboxId: null,
      currentUserId,
      memberId: ft === 'inbox' ? memberId : null,
      includeSpam,
    });
    const { count, error } = await q;
    if (error) throw new HttpError(500, error.message || 'Failed to count conversations.');
    return count ?? 0;
  };

  const [inbox, mentions, created_by, unassigned, spam] = await Promise.all([
    countOne('inbox'),
    countOne('mentions'),
    countOne('created_by'),
    countOne('unassigned'),
    countOne('spam'),
  ]);

  return {
    inbox,
    mentions,
    created_by,
    created_by_you: created_by,
    unassigned,
    spam,
  };
}

export async function getFilteredConversations({
  filterType = 'inbox',
  currentUserId,
  organizationId,
  scopeInboxId = null,
  assigneeMemberId = null,
  channelId = null,
  page,
  pageSize,
  from,
  to,
  includeSpam = false,
  tagId = null,
  aiIntent = null,
}) {
  if (!currentUserId) {
    throw new HttpError(400, 'currentUserId is required.');
  }
  if (!organizationId) {
    throw new HttpError(400, 'organizationId is required.');
  }

  const ft = normalizeConversationFilterType(filterType);
  const membership = await ensureOrgMembership(currentUserId, organizationId);
  const memberId = membership.id;

  let tagConversationIds = null;
  if (tagId) {
    const { data: tagRows, error: tagErr } = await supabaseAdmin
      .from('conversation_tags')
      .select('conversation_id')
      .eq('organization_id', organizationId)
      .eq('tag_id', tagId);

    if (tagErr) {
      const missing =
        tagErr.message?.includes('conversation_tags') ||
        tagErr.code === '42P01' ||
        tagErr.code === 'PGRST205';
      if (missing) {
        throw new HttpError(503, 'Conversation tags are not available. Apply database migrations.');
      }
      throw new HttpError(500, tagErr.message || 'Failed to filter by tag.');
    }

    tagConversationIds = (tagRows ?? []).map((r) => r.conversation_id).filter(Boolean);
    if (tagConversationIds.length === 0) {
      return {
        items: [],
        pagination: { page, pageSize, total: 0 },
        filterType: ft,
        tagId,
      };
    }
  }

  if (ft === 'mentions') {
    const { data: idRows, error: rpcError } = await supabaseAdmin.rpc('conversation_ids_mentioning_user', {
      p_organization_id: organizationId,
      p_user_id: currentUserId,
    });

    if (rpcError) throw new HttpError(500, rpcError.message || 'Failed to resolve mention conversations.');

    const ids = (idRows ?? []).map((row) => row?.id).filter(Boolean);
    const total = ids.length;

    if (total === 0) {
      return {
        items: [],
        pagination: { page, pageSize, total: 0 },
        filterType: ft,
      };
    }

    let query = supabaseAdmin.from('conversations').select('*', { count: 'exact' }).in('id', ids);

    if (tagConversationIds) {
      const allowed = new Set(tagConversationIds);
      const filteredIds = ids.filter((id) => allowed.has(id));
      if (filteredIds.length === 0) {
        return {
          items: [],
          pagination: { page, pageSize, total: 0 },
          filterType: ft,
          tagId,
        };
      }
      query = query.in('id', filteredIds);
    }

    const { data, error, count } = await query
      .order('last_message_at', { ascending: false })
      .range(from, to);

    if (error) throw new HttpError(500, error.message || 'Failed to fetch conversations.');
    return {
      items: data ?? [],
      pagination: {
        page,
        pageSize,
        total: count ?? total,
      },
      filterType: ft,
    };
  }

  let query = supabaseAdmin.from('conversations').select('*', { count: 'exact' });

  query = applyConversationFilters(query, {
    filterType: ft,
    organizationId,
    scopeInboxId: ft === 'team_inbox' ? scopeInboxId : null,
    currentUserId,
    memberId: ft === 'inbox' ? memberId : null,
    assigneeMemberId: ft === 'teammate' ? assigneeMemberId : null,
    channelId: ft === 'channel' ? channelId : null,
    includeSpam: Boolean(includeSpam),
    aiIntent,
  });

  if (tagConversationIds) {
    query = query.in('id', tagConversationIds);
  }

  const { data, error, count } = await query
    .order('last_message_at', { ascending: false })
    .range(from, to);

  if (error) throw new HttpError(500, error.message || 'Failed to fetch conversations.');
  return {
    items: data ?? [],
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
    },
    filterType: ft,
    ...(tagId ? { tagId } : {}),
  };
}
