import { Router } from 'express';
import { receiveEmailWebhookController } from '../controllers/emailWebhook.controller.js';
import { emailWebhookRateLimit } from '../middleware/emailWebhookRateLimit.js';

const router = Router();

router.post('/email', emailWebhookRateLimit, receiveEmailWebhookController);

export default router;
