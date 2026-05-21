import { mergeOrgIngressPolicy } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { emitSupportEvent } from '../analytics/supportEvents.service.js';
import { scoreInboundSpam } from './ingressHeuristics.js';
import { findDuplicateInboundMessage, stampMessageContentHash } from './ingressDuplicate.js';

/**
 * @param {string} organizationId
 */
export async function getOrgIngressPolicy(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to load ingress policy.');
  }
  const settings = data?.settings && typeof data.settings === 'object' ? data.settings : {};
  return mergeOrgIngressPolicy(settings.ingress);
}

/**
 * @typedef {object} IngressEvaluation
 * @property {'allow' | 'reject_spam' | 'suppress_duplicate'} decision
 * @property {string} channel
 * @property {string[]} reasons
 * @property {{ score: number, signals: string[] } | null} spam
 * @property {{ conversationId: string, messageId: string } | null} duplicate
 */

/**
 * Pre-insert ingress policy (spam + duplicate). Does not mutate DB.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {'web' | 'email'} params.channel
 * @param {string} params.email
 * @param {string} params.message
 * @param {string} [params.externalMessageId]
 */
export async function evaluateInboundIngressPolicy({
  organizationId,
  channel,
  email,
  message,
  externalMessageId,
}) {
  const policy = await getOrgIngressPolicy(organizationId);
  /** @type {IngressEvaluation} */
  const evaluation = {
    decision: 'allow',
    channel,
    reasons: [],
    spam: null,
    duplicate: null,
  };

  if (policy.duplicate_enabled) {
    const dup = await findDuplicateInboundMessage({
      organizationId,
      customerEmail: email,
      message,
      windowMinutes: policy.duplicate_window_minutes,
      externalMessageId: channel === 'email' ? externalMessageId : undefined,
    });
    if (dup?.id && dup.conversation_id) {
      evaluation.decision = 'suppress_duplicate';
      evaluation.reasons.push('duplicate_content');
      evaluation.duplicate = {
        conversationId: dup.conversation_id,
        messageId: dup.id,
      };
      return evaluation;
    }
  }

  if (policy.spam_enabled) {
    const spam = scoreInboundSpam({ message, blocklist: policy.blocklist });
    evaluation.spam = { score: spam.score, signals: spam.signals };
    if (spam.isSpam) {
      evaluation.reasons.push('spam_heuristic');
      if (policy.spam_action === 'reject') {
        evaluation.decision = 'reject_spam';
        return evaluation;
      }
    }
  }

  return evaluation;
}

/**
 * Post-insert: flag spam in conversation metadata, stamp content hash, emit events.
 * Skips automation callers when decision was allow but spam flagged.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string} params.messageId
 * @param {string} params.message
 * @param {IngressEvaluation} params.evaluation
 */
export async function applyInboundIngressPostInsert({
  organizationId,
  conversationId,
  messageId,
  message,
  evaluation,
}) {
  await stampMessageContentHash({ organizationId, messageId, message });

  if (!evaluation?.spam?.signals?.length) return { flagged: false };

  const policy = await getOrgIngressPolicy(organizationId);
  if (!policy.spam_enabled || policy.spam_action !== 'flag') {
    return { flagged: false };
  }

  const spam = scoreInboundSpam({ message, blocklist: policy.blocklist });
  if (!spam.isSpam) return { flagged: false };

  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('metadata, channel_type')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  const priorMeta = conv?.metadata && typeof conv.metadata === 'object' ? { ...conv.metadata } : {};
  priorMeta.ingress = {
    ...(priorMeta.ingress && typeof priorMeta.ingress === 'object' ? priorMeta.ingress : {}),
    spam_suspected: true,
    spam_score: spam.score,
    spam_signals: spam.signals,
    flagged_at: new Date().toISOString(),
    flagged_message_id: messageId,
  };

  await supabaseAdmin
    .from('conversations')
    .update({ metadata: priorMeta })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  emitSupportEvent({
    organizationId,
    eventType: 'ingress.spam_flagged',
    entityType: 'conversation',
    entityId: conversationId,
    channelType: conv?.channel_type ?? evaluation.channel,
    payload: {
      message_id: messageId,
      score: spam.score,
      signals: spam.signals,
      channel: evaluation.channel,
    },
  });

  return { flagged: true };
}

/**
 * @param {IngressEvaluation} evaluation
 */
export function shouldSkipPostInboundAutomation(evaluation) {
  return (
    evaluation?.decision === 'suppress_duplicate' ||
    evaluation?.decision === 'reject_spam'
  );
}

/**
 * Log structured ingress decision (no raw message body).
 */
export function logIngressDecision(evaluation, organizationId) {
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      scope: 'ingress',
      organization_id: organizationId,
      decision: evaluation.decision,
      channel: evaluation.channel,
      reasons: evaluation.reasons,
      spam_score: evaluation.spam?.score ?? null,
      duplicate_message_id: evaluation.duplicate?.messageId ?? null,
    }),
  );
}
