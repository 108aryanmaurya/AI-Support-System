import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/health', aiController.aiHealth);

router.post('/assist', requireAuth, aiController.aiAssist);

export default router;
