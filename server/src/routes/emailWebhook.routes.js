import { Router } from 'express';
import { receiveEmailWebhookController } from '../controllers/emailWebhook.controller.js';

const router = Router();

router.post('/email', receiveEmailWebhookController);

export default router;
