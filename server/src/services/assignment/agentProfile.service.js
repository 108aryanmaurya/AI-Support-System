import {
  defaultAgentProfileRow,
  isAgentRoutingStatus,
  normalizeAgentTimezone,
  normalizeMaxConcurrency,
  normalizeShiftTime,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';

function timeToApi(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : null;
  }
  return null;
}

async function assertMemberInOrg(organizationId, memberId) {
  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('id, role, status')
    .eq('id', memberId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to validate member.');
  }
  if (!data) {
    throw new HttpError(404, 'Member not found in this organization.');
  }
  if (data.status !== 'ACTIVE') {
    throw new HttpError(400, 'Cannot configure assignment profile for non-active member.');
  }
  return data;
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 */
export async function getAgentAssignmentConfig(organizationId, memberId) {
  await assertMemberInOrg(organizationId, memberId);

  const defaults = defaultAgentProfileRow();

  const [profileRes, presenceRes] = await Promise.all([
    supabaseAdmin
      .from('agent_profiles')
      .select('status, max_concurrency, shift_start, shift_end, timezone, updated_at')
      .eq('organization_id', organizationId)
      .eq('member_id', memberId)
      .maybeSingle(),
    supabaseAdmin
      .from('agent_presence')
      .select('presence, last_seen')
      .eq('organization_id', organizationId)
      .eq('member_id', memberId)
      .maybeSingle(),
  ]);

  const profileMissing =
    profileRes.error?.message?.includes('agent_profiles') ||
    profileRes.error?.code === '42P01' ||
    profileRes.error?.code === 'PGRST205';
  if (profileRes.error && !profileMissing) {
    throw new HttpError(500, profileRes.error.message || 'Failed to load agent profile.');
  }

  const p = profileRes.data;
  const profile = {
    status: p?.status ?? defaults.status,
    maxConcurrency: p?.max_concurrency ?? defaults.max_concurrency,
    shiftStart: timeToApi(p?.shift_start),
    shiftEnd: timeToApi(p?.shift_end),
    timezone: p?.timezone ?? defaults.timezone,
    updatedAt: p?.updated_at ?? null,
  };

  const presence = presenceRes.data
    ? { presence: presenceRes.data.presence, lastSeen: presenceRes.data.last_seen }
    : { presence: 'offline', lastSeen: null };

  return {
    memberId,
    profile,
    presence,
  };
}

/**
 * @param {string} organizationId
 * @param {string} memberId
 * @param {object} body
 */
export async function upsertAgentAssignmentConfig(organizationId, memberId, body = {}) {
  await assertMemberInOrg(organizationId, memberId);

  const defaults = defaultAgentProfileRow();
  const hasProfilePatch = body.profile && typeof body.profile === 'object';

  if (!hasProfilePatch) {
    throw new HttpError(400, 'Provide profile to update.');
  }

  const prof = body.profile;
  let status = defaults.status;
  if (Object.prototype.hasOwnProperty.call(prof, 'status')) {
    const s = typeof prof.status === 'string' ? prof.status.trim() : prof.status;
    if (!isAgentRoutingStatus(s)) {
      throw new HttpError(400, 'profile.status must be active or inactive.');
    }
    status = s;
  }

  let maxConcurrency = defaults.max_concurrency;
  try {
    maxConcurrency = normalizeMaxConcurrency(
      Object.prototype.hasOwnProperty.call(prof, 'maxConcurrency')
        ? prof.maxConcurrency
        : prof.max_concurrency,
    );
  } catch (e) {
    throw new HttpError(400, e?.message || 'Invalid maxConcurrency.');
  }

  let shiftStart = null;
  let shiftEnd = null;
  let timezone = defaults.timezone;
  try {
    if (Object.prototype.hasOwnProperty.call(prof, 'shiftStart')) {
      shiftStart = normalizeShiftTime(prof.shiftStart);
    } else if (Object.prototype.hasOwnProperty.call(prof, 'shift_start')) {
      shiftStart = normalizeShiftTime(prof.shift_start);
    }
    if (Object.prototype.hasOwnProperty.call(prof, 'shiftEnd')) {
      shiftEnd = normalizeShiftTime(prof.shiftEnd);
    } else if (Object.prototype.hasOwnProperty.call(prof, 'shift_end')) {
      shiftEnd = normalizeShiftTime(prof.shift_end);
    }
    if (Object.prototype.hasOwnProperty.call(prof, 'timezone')) {
      timezone = normalizeAgentTimezone(prof.timezone);
    }
  } catch (e) {
    throw new HttpError(400, e?.message || 'Invalid profile fields.');
  }

  const now = new Date().toISOString();
  const { error: profileErr } = await supabaseAdmin.from('agent_profiles').upsert(
    {
      organization_id: organizationId,
      member_id: memberId,
      status,
      max_concurrency: maxConcurrency,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      timezone,
      updated_at: now,
    },
    { onConflict: 'member_id' },
  );

  if (profileErr) {
    const missing =
      profileErr.message?.includes('agent_profiles') ||
      profileErr.code === '42P01' ||
      profileErr.code === 'PGRST205';
    if (missing) {
      throw new HttpError(503, 'Assignment schema not applied. Run database migrations.');
    }
    throw new HttpError(500, profileErr.message || 'Failed to save agent profile.');
  }

  return getAgentAssignmentConfig(organizationId, memberId);
}
