import { isSupportEventType } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';

/**
 * Record a support event (non-blocking for callers — logs failures).
 * @param {object} params
 */
export async function insertSupportEvent({
  organizationId,
  eventType,
  entityType,
  entityId,
  actorMemberId = null,
  channelType = null,
  payload = {},
}) {
  if (!organizationId || !eventType || !entityType || !entityId) return;
  if (!isSupportEventType(eventType)) {
    console.warn('[analytics] unknown event_type:', eventType);
    return;
  }

  const { error } = await supabaseAdmin.from('support_events').insert({
    organization_id: organizationId,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    actor_member_id: actorMemberId,
    channel_type: channelType,
    payload: payload && typeof payload === 'object' ? payload : {},
  });

  if (error) {
    const missing =
      error.message?.includes('support_events') ||
      error.code === '42P01' ||
      error.code === 'PGRST205';
    if (!missing) {
      console.warn('[analytics] insertSupportEvent failed:', error.message);
    }
  }
}

/** Fire-and-forget wrapper. */
export function emitSupportEvent(params) {
  void insertSupportEvent(params).catch(() => {});
}
