import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createConversationController,
  getConversationMessagesController,
  getConversationsController,
} from '../controllers/conversations.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', createConversationController);
router.get('/', getConversationsController);
router.get('/:id/messages', getConversationMessagesController);

export default router;
