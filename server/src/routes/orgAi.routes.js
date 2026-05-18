import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import { orgAiAssistRateLimit } from '../middleware/aiRateLimit.js';

const router = Router({ mergeParams: true });

/** All org AI routes: per-org + per-user Redis limits. */
router.use(orgAiAssistRateLimit);

router.get('/health', aiController.aiHealth);
router.post('/assist', aiController.aiAssist);
router.post('/suggest-reply', aiController.aiSuggestReply);
router.post('/summarize', aiController.aiSummarize);
router.post('/translate', aiController.aiTranslate);
router.post('/rewrite', aiController.aiRewrite);

export default router;
