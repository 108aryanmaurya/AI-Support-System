import { CONVERSATION_ACTIVE_STATUSES } from '@ai-support/shared';
import { supabaseAdmin } from '../../../config/supabase.js';
import { emitSupportEvent } from '../../analytics/supportEvents.service.js';
import { getOrgAutomationSettings } from '../orgAutomationSettings.service.js';
import { enqueueAutomationJob } from '../enqueueJob.service.js';

/**
 * Find open conversations past first-response SLA without an agent reply; emit support_events.
 * Does not auto-assign in Phase 1.
 */
export async function handleSlaScanOrg(job) {
  const organizationId = job.organization_id;
  const settings = await getOrgAutomationSettings(organizationId);
  if (!settings.sla_enabled) return;

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
  }
}

/** Enqueue SLA scan for every org (cron). */
export async function enqueueSlaScansForAllOrgs() {
  const { data: orgs, error } = await supabaseAdmin.from('organizations').select('id');
  if (error) throw new Error(error.message);

  for (const org of orgs ?? []) {
    const day = new Date().toISOString().slice(0, 10);
    await enqueueAutomationJob({
      organizationId: org.id,
      jobType: 'sla.scan_org',
      payload: {},
      idempotencyKey: `sla.scan:${org.id}:${day}`,
    });
  }
}
