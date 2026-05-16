import { Router } from 'express';
import { env } from '../config/env.js';
import { pingRedis } from '../config/redis.js';
import { getOutboundMonitorStats } from '../services/outboundDeliveryMonitor.service.js';

const router = Router();

function requireCronSecret(req, res) {
  const secret = req.headers['x-automation-cron-secret'];
  if (!env.automationCronSecret || secret !== env.automationCronSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * GET /api/internal/ops/rate-limits
 * Header: x-automation-cron-secret
 */
router.get('/rate-limits', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  const redis = await pingRedis();
  res.json({
    ok: true,
    backend: 'redis',
    redis,
    outbound_monitor: getOutboundMonitorStats(),
  });
});

export default router;
