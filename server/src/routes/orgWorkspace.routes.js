import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrgAccess, requireRole } from '../middleware/orgAccess.js';
import conversationsRoutes from './conversations.routes.js';
import customersRoutes from './customers.routes.js';
import messagesAuthRoutes from './messagesAuth.routes.js';
import {
  createInviteController,
  createInvitesBatchController,
  listMembersController,
  listPendingInvitesController,
  listWorkspaceChannelsController,
} from '../controllers/org.controller.js';

/**
 * Authenticated org workspace mounted at `/api/org/:orgId`.
 * Membership is resolved from URL param only (never body/query).
 */
const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireOrgAccess());

router.get('/members', listMembersController);
router.get('/channels', listWorkspaceChannelsController);
router.post('/invites/batch', requireRole('ADMIN'), createInvitesBatchController);
router.get('/invites', listPendingInvitesController);
router.post('/invite', requireRole('ADMIN'), createInviteController);
router.use('/conversations', conversationsRoutes);
router.use('/customers', customersRoutes);
router.use('/messages', messagesAuthRoutes);

export default router;
