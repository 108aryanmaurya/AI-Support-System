import { Router } from 'express';
import * as messagesController from '../controllers/messages.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/:ticketId', messagesController.listMessages);
router.post('/:ticketId', messagesController.createMessage);

export default router;
