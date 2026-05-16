import { Router } from 'express';
import { env } from '../config/env.js';
import { enqueueSlaScansForAllOrgs } from '../services/automation/jobHandlers/slaScanOrg.js';

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

export default router;
