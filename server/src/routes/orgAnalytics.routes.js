import { Router } from 'express';
import {
  analyticsAiController,
  analyticsAiRunsController,
  analyticsConversationsController,
  analyticsKnowledgeController,
  analyticsOverviewController,
  analyticsTeamController,
} from '../controllers/analytics.controller.js';

const router = Router({ mergeParams: true });

router.get('/overview', analyticsOverviewController);
router.get('/conversations', analyticsConversationsController);
router.get('/team', analyticsTeamController);
router.get('/ai', analyticsAiController);
router.get('/ai/runs', analyticsAiRunsController);
router.get('/knowledge', analyticsKnowledgeController);

export default router;
