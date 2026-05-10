import { Router } from 'express';
import * as messagesController from '../controllers/messages.controller.js';

const router = Router({ mergeParams: true });

router.post('/send', messagesController.sendInboxMessageController);
router.post('/', messagesController.createMessageController);

export default router;
