import { Router } from 'express';
import { receiveResendWebhookController } from '../controllers/resendWebhook.controller.js';
import { emailWebhookRateLimit } from '../middleware/emailWebhookRateLimit.js';

const router = Router();

router.post('/resend', emailWebhookRateLimit, receiveResendWebhookController);
/** @deprecated Prefer POST /api/webhooks/resend — kept for existing Resend dashboard URLs. */
router.post('/email', emailWebhookRateLimit, receiveResendWebhookController);

export default router;
