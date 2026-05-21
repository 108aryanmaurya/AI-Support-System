import { Router } from 'express';
import { env } from '../config/env.js';
import { enqueueSlaScansForAllOrgs } from '../services/automation/jobHandlers/slaScanOrg.js';
import { enqueueWorkflowScheduleScansForAllOrgs } from '../services/automation/jobHandlers/workflowScheduleOrg.js';

const router = Router();

/**
 * POST /api/internal/cron/sla-scan
 * Header: x-automation-cron-secret
 */
router.post('/sla-scan', async (req, res, next) => {
  try {
    const secret = req.headers['x-automation-cron-secret'];
    if (!env.automationCronSecret || secret !== env.automationCronSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await enqueueSlaScansForAllOrgs();
    res.json({ ok: true, enqueued: 'sla.scan_org per organization' });
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
