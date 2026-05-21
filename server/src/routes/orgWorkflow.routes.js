import { Router } from 'express';
import { requireRole } from '../middleware/orgAccess.js';
import {
  dryRunWorkflowController,
  getWorkflowMetricsController,
  getWorkflowRulesController,
  postWorkflowTestNotificationController,
  putWorkflowRulesController,
} from '../controllers/workflow.controller.js';
import { orgAiOrgOnlyRateLimit } from '../middleware/aiRateLimit.js';

const router = Router({ mergeParams: true });

router.get('/rules', orgAiOrgOnlyRateLimit, getWorkflowRulesController);
router.put('/rules', orgAiOrgOnlyRateLimit, requireRole('ADMIN'), putWorkflowRulesController);
router.get('/metrics', orgAiOrgOnlyRateLimit, getWorkflowMetricsController);
router.post('/test-notification', orgAiOrgOnlyRateLimit, requireRole('ADMIN'), postWorkflowTestNotificationController);
router.post('/dry-run', orgAiOrgOnlyRateLimit, dryRunWorkflowController);

export default router;
