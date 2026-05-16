import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { globalAiUserRateLimit } from '../middleware/aiRateLimit.js';

const router = Router();

router.get('/health', aiController.aiHealth);

/** Legacy global route — prefer `POST /api/org/:orgId/ai/assist`. Per-user rate limit only. */
router.post('/assist', requireAuth, globalAiUserRateLimit, aiController.aiAssist);

export default router;
