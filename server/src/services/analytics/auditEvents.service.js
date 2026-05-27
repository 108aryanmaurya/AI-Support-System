import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Paginated org audit trail from `support_events` (admin-only route).
 *
 * @param {string} organizationId
 * @param {Record<string, unknown>} query
 */
export async function listOrgAuditEvents(organizationId, query = {}) {
  const limitRaw = Number(query.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const cursor =
    typeof query.cursor === 'string' && query.cursor.trim() ? query.cursor.trim() : null;

  let q = supabaseAdmin
    .from('support_events')
    .select(
      'id, event_type, entity_type, entity_id, actor_member_id, channel_type, payload, created_at',
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  const eventType =
    typeof query.eventType === 'string' && query.eventType.trim()
      ? query.eventType.trim()
      : null;
  if (eventType) {
    q = q.eq('event_type', eventType);
  }

  if (cursor) {
    q = q.lt('created_at', cursor);
  }

  const { data, error } = await q;

  if (error) {
    const missing =
      error.message?.includes('support_events') ||
      error.code === '42P01' ||
      error.code === 'PGRST205';
    if (missing) {
      return { events: [], nextCursor: null, available: false };
    }
    throw new HttpError(500, error.message || 'Failed to load audit events.');
  }

  const rows = Array.isArray(data) ? data : [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && page.length ? page[page.length - 1].created_at : null;

  return {
    available: true,
    events: page.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorMemberId: row.actor_member_id,
      channelType: row.channel_type,
      payload: row.payload ?? {},
      createdAt: row.created_at,
    })),
    nextCursor,
  };
}
