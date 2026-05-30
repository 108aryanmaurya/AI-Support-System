import { Router } from 'express';
import { requirePermission } from '../middleware/orgAccess.js';
import { inboxTransferRateLimit } from '../middleware/inboxRateLimit.js';
import {
  claimConversationController,
  createConversationController,
  getConversationCountsController,
  getConversationMessagesController,
  getConversationsController,
  listOrganizationMembersController,
  patchConversationController,
  patchConversationSpamController,
} from '../controllers/conversations.controller.js';
import { transferConversationInboxController } from '../controllers/transferInbox.controller.js';

const router = Router({ mergeParams: true });

router.post('/', createConversationController);
router.get('/', getConversationsController);
router.get('/counts', getConversationCountsController);
router.get('/members', listOrganizationMembersController);
router.post('/:id/transfer-inbox', inboxTransferRateLimit, transferConversationInboxController);
router.post('/:id/claim', claimConversationController);
router.patch('/:id/spam', requirePermission('conversations.mark_spam'), patchConversationSpamController);
router.patch('/:id', patchConversationController);
router.get('/:id/messages', getConversationMessagesController);

export default router;
