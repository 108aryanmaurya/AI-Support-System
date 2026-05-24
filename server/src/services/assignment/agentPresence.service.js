import {
  AGENT_PRESENCE_HEARTBEAT_STATES,
  isAgentPresenceHeartbeatState,
  isPresenceAssignable,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import {
  getAssignmentRedisSnapshot,
  getPresenceFromRedis,
  isAssignmentRedisAvailable,
  setPresenceInRedis,
} from './assignmentRedis.service.js';
import { syncActiveChatsFromDb } from './agentWorkload.service.js';

/**
 * @param {string} organizationId
 * @param {string} memberId
 * @param {string} [presence] — defaults to `online`
 */
export async function recordAgentPresenceHeartbeat(organizationId, memberId, presence = 'online') {
  const state = isAgentPresenceHeartbeatState(presence) ? presence : 'online';

  const now = new Date().toISOString();

  const { error: dbErr } = await supabaseAdmin.from('agent_presence').upsert(
    {
      organization_id: organizationId,
      member_id: memberId,
      presence: state,
      last_seen: now,
    },
    { onConflict: 'member_id' },
  );

  if (dbErr) {
    const missing =
      dbErr.message?.includes('agent_presence') ||
      dbErr.code === '42P01' ||
      dbErr.code === 'PGRST205';
    if (missing) {
      throw new HttpError(503, 'Assignment schema not applied. Run database migrations.');
    }
    throw new HttpError(500, dbErr.message || 'Failed to update agent presence.');
  }

  const redisOk = await setPresenceInRedis(organizationId, memberId, state);
  const activeChats = await syncActiveChatsFromDb(organizationId, memberId);

  return {
    presence: state,
    lastSeen: now,
    assignable: isPresenceAssignable(state),
    redisPresence: redisOk,
    activeChats,
  };
}

/**
 * Mark agent offline in DB (Redis key expires via TTL).
 *
 * @param {string} organizationId
 * @param {string} memberId
 */
export async function recordAgentPresenceOffline(organizationId, memberId) {
  const now = new Date().toISOString();
  await supabaseAdmin.from('agent_presence').upsert(
    {
      organization_id: organizationId,
      member_id: memberId,
      presence: 'offline',
      last_seen: now,
    },
    { onConflict: 'member_id' },
  );

  const { scheduleReassignForOfflineAgent } = await import(
    '../automation/enqueueReassign.service.js'
  );
  scheduleReassignForOfflineAgent(organizationId, memberId);
}

/**
 * Org-wide presence + workload snapshot for admins (Redis overlay on DB).
 *
 * @param {string} organizationId
 */
export async function listOrgAgentPresenceSnapshot(organizationId) {
  const { data: members, error: mErr } = await supabaseAdmin
    .from('organization_members')
    .select('id, user_id, role')
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE');

  if (mErr) {
    throw new HttpError(500, mErr.message || 'Failed to load members.');
  }

  const memberIds = (members ?? []).map((m) => m.id);
  if (memberIds.length === 0) {
    return { agents: [], redisAvailable: await isAssignmentRedisAvailable() };
  }

  const [presenceRows, redisSnap] = await Promise.all([
    supabaseAdmin
      .from('agent_presence')
      .select('member_id, presence, last_seen')
      .eq('organization_id', organizationId)
      .in('member_id', memberIds),
    getAssignmentRedisSnapshot(organizationId, memberIds),
  ]);

  const dbByMember = new Map((presenceRows.data ?? []).map((r) => [r.member_id, r]));

  const agents = memberIds.map((memberId) => {
    const db = dbByMember.get(memberId);
    const redis = redisSnap.get(memberId) ?? { presence: null, activeChats: null };
    const effectivePresence = redis.presence ?? db?.presence ?? 'offline';
    return {
      memberId,
      presence: effectivePresence,
      lastSeen: db?.last_seen ?? null,
      assignable: isPresenceAssignable(effectivePresence),
      activeChats: redis.activeChats,
      source: redis.presence ? 'redis' : 'database',
    };
  });

  return {
    agents,
    redisAvailable: await isAssignmentRedisAvailable(),
    heartbeatStates: [...AGENT_PRESENCE_HEARTBEAT_STATES],
  };
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 */
export async function getAgentPresenceForMember(organizationId, memberId) {
  const redisPresence = await getPresenceFromRedis(organizationId, memberId);

  const { data, error } = await supabaseAdmin
    .from('agent_presence')
    .select('presence, last_seen')
    .eq('organization_id', organizationId)
    .eq('member_id', memberId)
    .maybeSingle();

  if (error && !error.message?.includes('agent_presence')) {
    throw new HttpError(500, error.message || 'Failed to load presence.');
  }

  const effectivePresence = redisPresence ?? data?.presence ?? 'offline';
  return {
    memberId,
    presence: effectivePresence,
    lastSeen: data?.last_seen ?? null,
    assignable: isPresenceAssignable(effectivePresence),
  };
}
