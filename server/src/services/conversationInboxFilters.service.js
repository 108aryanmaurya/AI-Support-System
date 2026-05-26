import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { ensureOrgMembership } from './support.service.js';
import { CONVERSATION_ACTIVE_STATUSES, isClassificationIntent } from '@ai-support/shared';

/** Sidebar / inbox filter keys — single source of truth for API + client. */
export const CONVERSATION_INBOX_FILTER_TYPES = Object.freeze([
  'inbox',
  'mentions',
  'created_by_you',
  'all',
  'unassigned',
  'spam',
  'sla_risk',
  'ingress_spam',
  'ai_intent',
  'closed',
  'resolved',
  'waiting_customer',
  'waiting_agent',
]);

/**
 * Whether non-spam-only filters should add `is_spam = false`.
 * Spam is excluded everywhere except the spam bucket and `all` + includeSpam.
 */
export function shouldExcludeSpam(filterType, includeSpam) {
  if (filterType === 'spam') return false;
  if (filterType === 'all' && includeSpam) return false;
  return true;
}

/**
 * Applies inbox sidebar rules to a Supabase conversations query chain.
 * Always start from `.from('conversations').select(...)`.
 *
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} query
 * @param {object} options
 * @param {string} options.filterType
 * @param {string} options.organizationId
 * @param {string} options.currentUserId — auth.users / public.users id
 * @param {string | null} options.memberId — organization_members.id for current user (required for `inbox`)
 * @param {boolean} [options.includeSpam]
 * @param {string | null} [options.aiIntent] — required when filterType is `ai_intent`
 * @returns {import('@supabase/supabase-js').PostgrestFilterBuilder}
 */
export function applyConversationFilters(query, options) {
  const {
    filterType,
    organizationId,
    currentUserId,
    memberId = null,
    includeSpam = false,
    aiIntent = null,
  } = options;

  if (!CONVERSATION_INBOX_FILTER_TYPES.includes(filterType)) {
    throw new HttpError(400, `Unknown filterType. Use one of: ${CONVERSATION_INBOX_FILTER_TYPES.join(', ')}.`);
  }

  let q = query.eq('organization_id', organizationId);

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
    case 'created_by_you':
      q = q.eq('created_by', currentUserId);
      break;
    case 'all':
      break;
    case 'unassigned':
      q = q.is('assigned_to_member_id', null).in('status', [...CONVERSATION_ACTIVE_STATUSES]);
      break;
    case 'spam':
      q = q.or('status.eq.spam,is_spam.eq.true');
      break;
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
 * Central inbox query: one code path for all sidebar filters.
 *
 * @param {object} params
 * @param {string} [params.filterType='all']
 * @param {string} params.currentUserId
 * @param {string} params.organizationId
 * @param {number} params.page
 * @param {number} params.pageSize
 * @param {number} params.from
 * @param {number} params.to
 * @param {boolean} [params.includeSpam=false] — only applies when filterType is `all`; includes spam rows.
 */
/**
 * Exact row counts per sidebar bucket (parallel head-only queries).
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
    if (filterType === 'mentions') {
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
      filterType,
      organizationId,
      currentUserId,
      memberId: filterType === 'inbox' ? memberId : null,
      includeSpam,
    });
    const { count, error } = await q;
    if (error) throw new HttpError(500, error.message || 'Failed to count conversations.');
    return count ?? 0;
  };

  const [
    inbox,
    mentions,
    created_by_you,
    all,
    unassigned,
    spam,
    sla_risk,
    ingress_spam,
    closed,
    resolved,
    waiting_customer,
    waiting_agent,
  ] = await Promise.all([
    countOne('inbox'),
    countOne('mentions'),
    countOne('created_by_you'),
    countOne('all'),
    countOne('unassigned'),
    countOne('spam'),
    countOne('sla_risk'),
    countOne('ingress_spam'),
    countOne('closed'),
    countOne('resolved'),
    countOne('waiting_customer'),
    countOne('waiting_agent'),
  ]);

  return {
    inbox,
    mentions,
    created_by_you,
    all,
    unassigned,
    spam,
    sla_risk,
    ingress_spam,
    closed,
    resolved,
    waiting_customer,
    waiting_agent,
  };
}

export async function getFilteredConversations({
  filterType = 'all',
  currentUserId,
  organizationId,
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
        filterType,
        tagId,
      };
    }
  }

  if (filterType === 'mentions') {
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
        pagination: {
          page,
          pageSize,
          total: 0,
        },
        filterType,
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
          filterType,
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
      filterType,
    };
  }

  let query = supabaseAdmin.from('conversations').select('*', { count: 'exact' });

  query = applyConversationFilters(query, {
    filterType,
    organizationId,
    currentUserId,
    memberId: filterType === 'inbox' ? memberId : null,
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
    filterType,
    ...(tagId ? { tagId } : {}),
  };
}
