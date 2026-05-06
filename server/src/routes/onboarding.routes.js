import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { completeOnboarding } from '../controllers/onboarding.controller.js';

const router = Router();

router.post('/complete', requireAuth, completeOnboarding);

export default router;
