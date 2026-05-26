import {
  CONVERSATION_ACTIVE_STATUSES,
  fifteenMinuteBucketKey,
  slaScanOrgIdempotencyKey,
  workflowSlaNextResponseIdempotencyKey,
  workflowSlaWarningIdempotencyKey,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../../config/supabase.js';
import { emitSupportEvent } from '../../analytics/supportEvents.service.js';
import { getOrgAutomationSettings } from '../orgAutomationSettings.service.js';
import { enqueueAutomationJob } from '../enqueueJob.service.js';
import { isWorkflowAutomationEnabled } from '../../ai/workflowAiGates.service.js';
import { markConversationSlaAtRisk } from '../../ai/workflowConversationFlags.service.js';
import {
  isNextResponseSlaBreached,
  nextResponseSlaCutoffIso,
} from '../../sla/slaNextResponse.js';

/**
 * Find open conversations past first-response SLA without an agent reply; emit support_events.
 */
async function scanFirstResponseSla(organizationId, settings) {
  const slaMs = settings.first_response_sla_minutes * 60 * 1000;
  const cutoff = new Date(Date.now() - slaMs).toISOString();

  const { data: conversations, error } = await supabaseAdmin
    .from('conversations')
    .select('id, channel_type, created_at, last_message_at')
    .eq('organization_id', organizationId)
    .in('status', [...CONVERSATION_ACTIVE_STATUSES])
    .eq('is_spam', false)
    .lt('created_at', cutoff);

  if (error) throw new Error(error.message || 'SLA scan failed');

  for (const conv of conversations ?? []) {
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('sender_type, created_at')
      .eq('conversation_id', conv.id)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });

    const list = messages ?? [];
    const firstCustomer = list.find((m) => m.sender_type === 'customer');
    if (!firstCustomer) continue;

    const firstCustomerAt = new Date(firstCustomer.created_at).getTime();
    if (Date.now() - firstCustomerAt < slaMs) continue;

    const agentReply = list.find(
      (m) => m.sender_type === 'agent' && new Date(m.created_at).getTime() > firstCustomerAt,
    );
    if (agentReply) continue;

    try {
      const { data: prior } = await supabaseAdmin
        .from('support_events')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('event_type', 'sla.first_response_breach')
        .eq('entity_id', conv.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (prior?.length) continue;
    } catch {
      // support_events table may not exist yet
    }

    emitSupportEvent({
      organizationId,
      eventType: 'sla.first_response_breach',
      entityType: 'conversation',
      entityId: conv.id,
      channelType: conv.channel_type ?? null,
      payload: {
        sla_minutes: settings.first_response_sla_minutes,
        first_customer_at: firstCustomer.created_at,
      },
    });

    if (await isWorkflowAutomationEnabled(organizationId)) {
      const day = new Date().toISOString().slice(0, 10);
      await enqueueAutomationJob({
        organizationId,
        jobType: 'ai.workflow_sla',
        payload: {
          conversationId: conv.id,
          slaMinutes: settings.first_response_sla_minutes,
          breachType: 'first_response',
        },
        idempotencyKey: workflowSlaWarningIdempotencyKey(organizationId, conv.id, day),
        maxAttempts: 4,
      });
    }
  }
}

/**
 * `waiting_agent` + stale `last_customer_message_at` without agent reply since.
 */
async function scanNextResponseSla(organizationId, settings) {
  const slaMinutes = settings.next_response_sla_minutes ?? settings.first_response_sla_minutes;
  const cutoff = nextResponseSlaCutoffIso(slaMinutes);

  const { data: rows, error } = await supabaseAdmin
    .from('conversations')
    .select(
      'id, channel_type, status, waiting_status, last_customer_message_at, last_agent_message_at',
    )
    .eq('organization_id', organizationId)
    .eq('waiting_status', 'waiting_agent')
    .in('status', [...CONVERSATION_ACTIVE_STATUSES])
    .eq('is_spam', false)
    .not('last_customer_message_at', 'is', null)
    .lt('last_customer_message_at', cutoff);

  if (error) throw new Error(error.message || 'Next-response SLA scan failed');

  for (const row of rows ?? []) {
    if (!isNextResponseSlaBreached(row, slaMinutes)) continue;

    try {
      const { data: prior } = await supabaseAdmin
        .from('support_events')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('event_type', 'sla.next_response_breach')
        .eq('entity_id', row.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (prior?.length) continue;
    } catch {
      // support_events table may not exist yet
    }

    await markConversationSlaAtRisk({
      organizationId,
      conversationId: row.id,
      slaMinutes,
    });

    emitSupportEvent({
      organizationId,
      eventType: 'sla.next_response_breach',
      entityType: 'conversation',
      entityId: row.id,
      channelType: row.channel_type ?? null,
      payload: {
        sla_minutes: slaMinutes,
        last_customer_message_at: row.last_customer_message_at,
        waiting_status: row.waiting_status,
      },
    });

    if (await isWorkflowAutomationEnabled(organizationId)) {
      const day = new Date().toISOString().slice(0, 10);
      await enqueueAutomationJob({
        organizationId,
        jobType: 'ai.workflow_sla',
        payload: {
          conversationId: row.id,
          slaMinutes,
          breachType: 'next_response',
        },
        idempotencyKey: workflowSlaNextResponseIdempotencyKey(organizationId, row.id, day),
        maxAttempts: 4,
      });
    }
  }
}

export async function handleSlaScanOrg(job) {
  const organizationId = job.organization_id;
  const settings = await getOrgAutomationSettings(organizationId);
  if (!settings.sla_enabled) return;

  await scanFirstResponseSla(organizationId, settings);
  await scanNextResponseSla(organizationId, settings);
}

/**
 * Enqueue SLA scan for every org (cron).
 *
 * @param {string} [scanBucketKey] — defaults to current UTC 15-minute bucket
 */
export async function enqueueSlaScansForAllOrgs(scanBucketKey = fifteenMinuteBucketKey()) {
  const { data: orgs, error } = await supabaseAdmin.from('organizations').select('id');
  if (error) throw new Error(error.message);

  for (const org of orgs ?? []) {
    await enqueueAutomationJob({
      organizationId: org.id,
      jobType: 'sla.scan_org',
      payload: { scanBucketKey },
      idempotencyKey: slaScanOrgIdempotencyKey(org.id, scanBucketKey),
    });
  }
}
