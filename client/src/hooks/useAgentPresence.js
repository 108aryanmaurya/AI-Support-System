import { useEffect, useRef } from 'react';
import { ASSIGNMENT_PRESENCE_DEFAULTS } from '@ai-support/shared';
import { postAgentPresenceHeartbeat, postAgentPresenceOffline } from '../services/assignmentApi.js';

const INTERVAL_MS = ASSIGNMENT_PRESENCE_DEFAULTS.heartbeatIntervalMs;

/**
 * Heartbeat agent presence while the inbox is mounted (Sprint 2).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {boolean} params.enabled
 * @param {'online' | 'available' | 'away' | 'busy'} [params.presence]
 */
export function useAgentPresence({ organizationId, enabled, presence = 'online' }) {
  const presenceRef = useRef(presence);
  presenceRef.current = presence;

  useEffect(() => {
    if (!enabled || !organizationId) return undefined;

    let cancelled = false;

    const tick = async () => {
      try {
        await postAgentPresenceHeartbeat(organizationId, { presence: presenceRef.current });
      } catch {
        /* best-effort; TTL will expire if server unreachable */
      }
    };

    void tick();
    const id = window.setInterval(() => {
      if (!cancelled) void tick();
    }, INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      void postAgentPresenceOffline(organizationId).catch(() => {});
    };
  }, [organizationId, enabled]);
}
