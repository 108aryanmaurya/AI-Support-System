import { Router } from 'express';
import { requireRole } from '../middleware/orgAccess.js';
import {
  createTagController,
  deleteTagController,
  getConversationTagsController,
  listTagsController,
  patchTagController,
  setConversationTagsController,
} from '../controllers/tags.controller.js';

const router = Router({ mergeParams: true });

router.get('/conversations/:conversationId', getConversationTagsController);
router.put('/conversations/:conversationId', setConversationTagsController);

router.get('/', listTagsController);
router.post('/', requireRole('ADMIN'), createTagController);
router.patch('/:tagId', requireRole('ADMIN'), patchTagController);
router.delete('/:tagId', requireRole('ADMIN'), deleteTagController);

export default router;
