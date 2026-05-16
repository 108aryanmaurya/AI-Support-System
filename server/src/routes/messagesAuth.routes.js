import { Router } from 'express';
import * as messagesController from '../controllers/messages.controller.js';
import { agentSendRateLimit } from '../middleware/agentSendRateLimit.js';

const router = Router({ mergeParams: true });

router.post('/send', agentSendRateLimit, messagesController.sendInboxMessageController);
router.post('/', messagesController.createMessageController);

export default router;
