import { buildAssignmentSettingsPatch, mergeOrgAssignmentRouting } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { getOrgAssignmentSettings } from './assignmentSettings.service.js';

async function loadSettingsRow(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, settings')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load organization settings.');
  }
  if (!data) {
    throw new HttpError(404, 'Organization not found.');
  }
  return data;
}

/**
 * Merged org assignment settings for admin UI (Sprint 7+).
 *
 * @param {string} organizationId
 */
export async function getOrgAssignmentSettingsForAdmin(organizationId) {
  return getOrgAssignmentSettings(organizationId);
}

/**
 * Deep-merge assignment settings; never replace entire `settings` or `assignment` JSONB.
 *
 * @param {string} organizationId
 * @param {unknown} body
 */
export async function putOrgAssignmentSettings(organizationId, body) {
  const patch = buildAssignmentSettingsPatch(body);
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, 'No valid assignment settings fields provided.');
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'default_assignee')) {
    const da = patch.default_assignee;
    if (da?.type === 'inbox' && da.inboxId) {
      const { data: inbox, error: inboxErr } = await supabaseAdmin
        .from('inboxes')
        .select('id')
        .eq('id', da.inboxId)
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .maybeSingle();
      if (inboxErr) {
        throw new HttpError(500, inboxErr.message || 'Failed to validate default assignee inbox.');
      }
      if (!inbox?.id) {
        throw new HttpError(400, 'default_assignee inbox is invalid or inactive.');
      }
    } else if (da?.type === 'member' && da.memberId) {
      const { data: member, error: memberErr } = await supabaseAdmin
        .from('organization_members')
        .select('id')
        .eq('id', da.memberId)
        .eq('organization_id', organizationId)
        .eq('status', 'ACTIVE')
        .maybeSingle();
      if (memberErr) {
        throw new HttpError(500, memberErr.message || 'Failed to validate default assignee member.');
      }
      if (!member?.id) {
        throw new HttpError(400, 'default_assignee member is invalid or inactive.');
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'fallback_notify_member_ids')) {
    const ids = Array.isArray(patch.fallback_notify_member_ids)
      ? patch.fallback_notify_member_ids
      : [];
    if (ids.length > 0) {
      const { data: members, error: mErr } = await supabaseAdmin
        .from('organization_members')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('status', 'ACTIVE')
        .in('id', ids);

      if (mErr) {
        throw new HttpError(500, mErr.message || 'Failed to validate fallback notify members.');
      }
      const found = new Set((members ?? []).map((m) => m.id));
      const invalid = ids.filter((id) => !found.has(id));
      if (invalid.length > 0) {
        throw new HttpError(400, 'fallback_notify_member_ids contains invalid member ids.');
      }
    }
    patch.fallback_notify_member_ids = ids;
  }

  const row = await loadSettingsRow(organizationId);
  const priorSettings = row.settings && typeof row.settings === 'object' ? row.settings : {};
  const priorAssignment =
    priorSettings.assignment && typeof priorSettings.assignment === 'object'
      ? { ...priorSettings.assignment }
      : {};

  const nextAssignment = mergeOrgAssignmentRouting({ ...priorAssignment, ...patch });
  const nextSettings = {
    ...priorSettings,
    assignment: nextAssignment,
  };

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ settings: nextSettings })
    .eq('id', organizationId);

  if (error) {
    throw new HttpError(500, error.message || 'Failed to save assignment settings.');
  }

  return mergeOrgAssignmentRouting(nextAssignment);
}
