import { Router } from 'express';
import { fifteenMinuteBucketKey, utcCalendarDayKey } from '@ai-support/shared';
import { env } from '../config/env.js';
import { enqueueSlaScansForAllOrgs } from '../services/automation/jobHandlers/slaScanOrg.js';
import { enqueueLifecycleScansForAllOrgs } from '../services/automation/jobHandlers/lifecycleScanOrg.js';
import { enqueueWorkflowScheduleScansForAllOrgs } from '../services/automation/jobHandlers/workflowScheduleOrg.js';
import { enqueueUnassignedScansForAllOrgs } from '../services/automation/jobHandlers/unassignedScanOrg.js';

const router = Router();

/**
 * POST /api/internal/cron/sla-scan
 * Header: x-automation-cron-secret
 * Idempotency: one `sla.scan_org` per org per 15-minute UTC bucket — run cron every 15 minutes.
 */
router.post('/sla-scan', async (req, res, next) => {
  try {
    const secret = req.headers['x-automation-cron-secret'];
    if (!env.automationCronSecret || secret !== env.automationCronSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const scanBucketKey = fifteenMinuteBucketKey();
    await enqueueSlaScansForAllOrgs(scanBucketKey);
    res.json({
      ok: true,
      enqueued: 'sla.scan_org per organization',
      scanBucketKey,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/internal/cron/lifecycle-scan
 * Header: x-automation-cron-secret
 * Idempotency: one `lifecycle.scan_org` per org per 15-minute UTC bucket — run cron every 15 minutes.
 */
router.post('/lifecycle-scan', async (req, res, next) => {
  try {
    const secret = req.headers['x-automation-cron-secret'];
    if (!env.automationCronSecret || secret !== env.automationCronSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const scanBucketKey = fifteenMinuteBucketKey();
    await enqueueLifecycleScansForAllOrgs(scanBucketKey);
    res.json({
      ok: true,
      enqueued: 'lifecycle.scan_org per organization',
      scanBucketKey,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/internal/cron/unassigned-auto-route-scan
 * Header: x-automation-cron-secret
 * Idempotency: one `assignment.scan_unassigned_org` per org per UTC day — run cron once daily.
 */
router.post('/unassigned-auto-route-scan', async (req, res, next) => {
  try {
    const secret = req.headers['x-automation-cron-secret'];
    if (!env.automationCronSecret || secret !== env.automationCronSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const dayKey = utcCalendarDayKey();
    await enqueueUnassignedScansForAllOrgs(dayKey);
    res.json({
      ok: true,
      enqueued: 'assignment.scan_unassigned_org per organization',
      dayKey,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/internal/cron/workflow-schedule-scan
 * Header: x-automation-cron-secret
 */
router.post('/workflow-schedule-scan', async (req, res, next) => {
  try {
    const secret = req.headers['x-automation-cron-secret'];
    if (!env.automationCronSecret || secret !== env.automationCronSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await enqueueWorkflowScheduleScansForAllOrgs();
    res.json({ ok: true, enqueued: 'ai.workflow_schedule_org per eligible organization' });
  } catch (e) {
    next(e);
  }
});

export default router;
