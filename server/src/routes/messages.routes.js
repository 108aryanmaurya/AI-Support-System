import { Router } from 'express';
import * as messagesController from '../controllers/messages.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { incomingMessageRateLimit } from '../middleware/incomingRateLimit.js';

const router = Router();

router.post('/incoming', incomingMessageRateLimit, messagesController.createIncomingMessageController);

router.use(requireAuth);

router.post('/send', messagesController.sendInboxMessageController);

router.post('/', messagesController.createMessageController);

export default router;
