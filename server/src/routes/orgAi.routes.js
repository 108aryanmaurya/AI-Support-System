import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import { orgAiAssistRateLimit } from '../middleware/aiRateLimit.js';

const router = Router({ mergeParams: true });

router.get('/health', aiController.aiHealth);
router.post('/assist', orgAiAssistRateLimit, aiController.aiAssist);

export default router;
