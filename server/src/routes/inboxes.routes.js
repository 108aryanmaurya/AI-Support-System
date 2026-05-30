import { Router } from 'express';
import { requirePermission, requireRole } from '../middleware/orgAccess.js';
import { inboxAdminRateLimit } from '../middleware/inboxRateLimit.js';
import {
  createInboxController,
  listInboxMembersController,
  listInboxesController,
  patchInboxController,
  replaceInboxMembersController,
} from '../controllers/inboxes.controller.js';

const router = Router({ mergeParams: true });

router.get('/', listInboxesController);
router.post('/', requireRole('ADMIN'), requirePermission('inboxes.manage'), inboxAdminRateLimit, createInboxController);
router.patch(
  '/:inboxId',
  requireRole('ADMIN'),
  requirePermission('inboxes.manage'),
  inboxAdminRateLimit,
  patchInboxController,
);
router.get('/:inboxId/members', listInboxMembersController);
router.put(
  '/:inboxId/members',
  requireRole('ADMIN'),
  requirePermission('inboxes.manage'),
  inboxAdminRateLimit,
  replaceInboxMembersController,
);

export default router;
