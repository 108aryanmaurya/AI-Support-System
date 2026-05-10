import { Router } from 'express';
import {
  createConversationController,
  getConversationCountsController,
  getConversationMessagesController,
  getConversationsController,
  listOrganizationMembersController,
  patchConversationController,
  patchConversationSpamController,
} from '../controllers/conversations.controller.js';

const router = Router({ mergeParams: true });

router.post('/', createConversationController);
router.get('/', getConversationsController);
router.get('/counts', getConversationCountsController);
router.get('/members', listOrganizationMembersController);
router.patch('/:id/spam', patchConversationSpamController);
router.patch('/:id', patchConversationController);
router.get('/:id/messages', getConversationMessagesController);

export default router;
