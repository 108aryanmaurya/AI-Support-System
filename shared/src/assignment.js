/**
 * Intelligent assignment — shared enums, limits, and payload validation (Sprint 1+).
 */

export const ASSIGNMENT_STRATEGIES = Object.freeze([
  'weighted_hybrid',
  'least_loaded',
  'round_robin',
  'skill_based',
]);

export const AGENT_ROUTING_STATUSES = Object.freeze(['active', 'inactive']);

export const AGENT_PRESENCE_STATES = Object.freeze([
  'online',
  'available',
  'away',
  'busy',
  'offline',
]);

/** Presence values the inbox client may report via heartbeat (not `offline` — use TTL expiry). */
export const AGENT_PRESENCE_HEARTBEAT_STATES = Object.freeze([
  'online',
  'available',
  'away',
  'busy',
]);

/** States eligible for auto-assignment (Sprint 3+). */
export const AGENT_PRESENCE_ASSIGNABLE = Object.freeze(['online', 'available']);

export const ASSIGNMENT_PRESENCE_DEFAULTS = Object.freeze({
  /** Redis TTL for `presence:{org}:{member}` — should exceed client heartbeat interval. */
  presenceTtlSec: 90,
  /** Suggested client heartbeat interval (ms). */
  heartbeatIntervalMs: 30_000,
});

/** Append-only `assignment_logs.reason` values (no free-text customer content). */
export const ASSIGNMENT_LOG_REASONS = Object.freeze([
  'manual',
  'workflow',
  'auto_route',
  'reassign',
  'unassign',
  'system',
]);

export const ASSIGNMENT_LIMITS = Object.freeze({
  maxSkillsPerAgent: 32,
  maxSkillNameLength: 64,
  minProficiency: 1,
  maxProficiency: 100,
  minConcurrency: 1,
  maxConcurrency: 50,
  defaultConcurrency: 5,
  maxTimezoneLength: 64,
});

const SHIFT_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * @param {unknown} v
 */
export function isAssignmentStrategy(v) {
  return typeof v === 'string' && ASSIGNMENT_STRATEGIES.includes(v);
}

/**
 * @param {unknown} v
 */
export function isAgentRoutingStatus(v) {
  return typeof v === 'string' && AGENT_ROUTING_STATUSES.includes(v);
}

/**
 * @param {unknown} v
 */
export function isAgentPresenceState(v) {
  return typeof v === 'string' && AGENT_PRESENCE_STATES.includes(v);
}

/**
 * @param {unknown} v
 */
export function isAgentPresenceHeartbeatState(v) {
  return typeof v === 'string' && AGENT_PRESENCE_HEARTBEAT_STATES.includes(v);
}

/**
 * Whether an agent may receive auto-assigned conversations (Sprint 3 eligibility).
 *
 * @param {unknown} presence
 */
export function isPresenceAssignable(presence) {
  return typeof presence === 'string' && AGENT_PRESENCE_ASSIGNABLE.includes(presence);
}

/**
 * @param {unknown} v
 */
export function isAssignmentLogReason(v) {
  return typeof v === 'string' && ASSIGNMENT_LOG_REASONS.includes(v);
}

/**
 * @param {unknown} raw — HH:MM 24h or null
 * @returns {string | null}
 */
export function normalizeShiftTime(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') {
    throw new Error('shift time must be a string HH:MM or null');
  }
  const t = raw.trim();
  if (!SHIFT_TIME_RE.test(t)) {
    throw new Error('shift time must be HH:MM (24-hour)');
  }
  return t;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeAgentTimezone(raw) {
  if (raw === null || raw === undefined || raw === '') return 'UTC';
  if (typeof raw !== 'string') {
    throw new Error('timezone must be a string');
  }
  const tz = raw.trim();
  if (!tz || tz.length > ASSIGNMENT_LIMITS.maxTimezoneLength) {
    throw new Error(`timezone must be 1–${ASSIGNMENT_LIMITS.maxTimezoneLength} characters`);
  }
  return tz;
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizeMaxConcurrency(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return ASSIGNMENT_LIMITS.defaultConcurrency;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error('maxConcurrency must be a number');
  }
  const rounded = Math.round(n);
  if (rounded < ASSIGNMENT_LIMITS.minConcurrency || rounded > ASSIGNMENT_LIMITS.maxConcurrency) {
    throw new Error(
      `maxConcurrency must be between ${ASSIGNMENT_LIMITS.minConcurrency} and ${ASSIGNMENT_LIMITS.maxConcurrency}`,
    );
  }
  return rounded;
}

/**
 * @param {unknown} raw
 * @returns {{ skill: string, proficiency: number }[]}
 */
export function validateAgentSkillsPayload(raw) {
  if (!Array.isArray(raw)) {
    throw new Error('skills must be an array');
  }
  if (raw.length > ASSIGNMENT_LIMITS.maxSkillsPerAgent) {
    throw new Error(`skills cannot exceed ${ASSIGNMENT_LIMITS.maxSkillsPerAgent} entries`);
  }

  const seen = new Set();
  /** @type {{ skill: string, proficiency: number }[]} */
  const out = [];

  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i];
    if (!row || typeof row !== 'object') {
      throw new Error(`skills[${i}] must be an object`);
    }
    const skillRaw = typeof row.skill === 'string' ? row.skill.trim().toLowerCase() : '';
    if (!skillRaw || skillRaw.length > ASSIGNMENT_LIMITS.maxSkillNameLength) {
      throw new Error(
        `skills[${i}].skill must be 1–${ASSIGNMENT_LIMITS.maxSkillNameLength} characters`,
      );
    }
    if (seen.has(skillRaw)) {
      throw new Error(`duplicate skill: ${skillRaw}`);
    }
    seen.add(skillRaw);

    let proficiency = Number(row.proficiency);
    if (!Number.isFinite(proficiency)) {
      proficiency = 50;
    }
    proficiency = Math.round(proficiency);
    if (
      proficiency < ASSIGNMENT_LIMITS.minProficiency ||
      proficiency > ASSIGNMENT_LIMITS.maxProficiency
    ) {
      throw new Error(
        `skills[${i}].proficiency must be ${ASSIGNMENT_LIMITS.minProficiency}–${ASSIGNMENT_LIMITS.maxProficiency}`,
      );
    }

    out.push({ skill: skillRaw, proficiency });
  }

  return out;
}

/**
 * Default agent profile when no row exists yet.
 */
export function defaultAgentProfileRow() {
  return {
    status: 'active',
    max_concurrency: ASSIGNMENT_LIMITS.defaultConcurrency,
    shift_start: null,
    shift_end: null,
    timezone: 'UTC',
  };
}
