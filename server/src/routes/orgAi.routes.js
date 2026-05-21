import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import orgWorkflowRoutes from './orgWorkflow.routes.js';
import {
  orgAiAssistRateLimit,
  orgAiComposerRateLimit,
  orgAiHeavyRateLimit,
  orgAiOrgOnlyRateLimit,
} from '../middleware/aiRateLimit.js';

const router = Router({ mergeParams: true });

router.use('/workflows', orgWorkflowRoutes);

router.get('/health', orgAiOrgOnlyRateLimit, aiController.aiHealth);
router.post('/feedback', orgAiOrgOnlyRateLimit, aiController.aiFeedback);

router.post('/assist', orgAiAssistRateLimit, aiController.aiAssist);
router.post('/suggest-reply', orgAiHeavyRateLimit, aiController.aiSuggestReply);
router.post('/suggest-reply/stream', orgAiHeavyRateLimit, aiController.aiSuggestReplyStream);
router.post('/summarize', orgAiHeavyRateLimit, aiController.aiSummarize);
router.post('/translate', orgAiComposerRateLimit, aiController.aiTranslate);
router.post('/rewrite', orgAiComposerRateLimit, aiController.aiRewrite);

export default router;
