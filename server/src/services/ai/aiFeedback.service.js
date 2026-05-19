import { AI_FEEDBACK_ACTIONS, isAiFeedbackAction } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { ensureOrgMembership } from '../support.service.js';
import { emitSupportEvent } from '../analytics/supportEvents.service.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTION_TO_RATING = Object.freeze({
  accepted: 1,
  edited: 1,
  rejected: -1,
});

const ACTION_TO_EVENT = Object.freeze({
  accepted: 'ai.suggestion_accepted',
  edited: 'ai.suggestion_edited',
  rejected: 'ai.suggestion_rejected',
});

function parseOptionalUuid(value, fieldName) {
  if (value == null || value === '') return null;
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return null;
  if (!UUID_V4_REGEX.test(s)) {
    throw new HttpError(400, `${fieldName} must be a valid UUID.`);
  }
  return s;
}

/**
 * Record agent feedback on an AI run (accept / edit / reject).
 */
export async function recordAiFeedback({
  organizationId,
  actorUserId,
  aiRunId,
  messageId = null,
  action,
  reason = null,
}) {
  if (!organizationId) throw new HttpError(400, 'organizationId is required.');
  if (!actorUserId) throw new HttpError(401, 'Authentication required.');

  const runId = parseOptionalUuid(aiRunId, 'aiRunId');
  if (!runId) throw new HttpError(400, 'aiRunId is required.');

  const actionNorm = typeof action === 'string' ? action.trim().toLowerCase() : '';
  if (!isAiFeedbackAction(actionNorm)) {
    throw new HttpError(
      400,
      `action must be one of: ${AI_FEEDBACK_ACTIONS.join(', ')}.`,
    );
  }

  const member = await ensureOrgMembership(actorUserId, organizationId);

  const { data: run, error: runErr } = await supabaseAdmin
    .from('ai_runs')
    .select('id, organization_id, conversation_id, feature')
    .eq('id', runId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (runErr) throw new HttpError(500, runErr.message || 'Failed to validate AI run.');
  if (!run) throw new HttpError(404, 'AI run not found in this organization.');

  const resolvedMessageId = parseOptionalUuid(messageId, 'messageId');
  if (resolvedMessageId) {
    const { data: msg, error: msgErr } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('id', resolvedMessageId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (msgErr) throw new HttpError(500, msgErr.message || 'Failed to validate message.');
    if (!msg) throw new HttpError(404, 'Message not found in this organization.');
  }

  const reasonText =
    typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 2000) : null;

  const { data: row, error: insertErr } = await supabaseAdmin
    .from('ai_feedback')
    .insert({
      organization_id: organizationId,
      ai_run_id: runId,
      message_id: resolvedMessageId,
      member_id: member.id,
      rating: ACTION_TO_RATING[actionNorm],
      action: actionNorm,
      reason: reasonText,
    })
    .select('id, organization_id, ai_run_id, message_id, action, rating, created_at')
    .single();

  if (insertErr) {
    if (insertErr.code === '23514') {
      throw new HttpError(400, insertErr.message || 'Invalid feedback payload.');
    }
    throw new HttpError(500, insertErr.message || 'Failed to record AI feedback.');
  }

  const eventType = ACTION_TO_EVENT[actionNorm];
  emitSupportEvent({
    organizationId,
    eventType,
    entityType: 'ai_run',
    entityId: runId,
    actorMemberId: member.id,
    payload: {
      action: actionNorm,
      message_id: resolvedMessageId,
      feature: run.feature ?? null,
      conversation_id: run.conversation_id ?? null,
    },
  });

  return { feedback: row };
}
