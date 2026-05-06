import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', authController.getAuthInfo);
router.get('/health', authController.getHealth);
router.get('/me', requireAuth, authController.getMe);
router.post('/register', requireAuth, authController.registerUser);

export default router;
