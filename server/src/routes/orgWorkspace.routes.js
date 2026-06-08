import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrgAccess, requirePermission, requireRole } from '../middleware/orgAccess.js';
import { listOrgAuditEventsController } from '../controllers/audit.controller.js';
import conversationsRoutes from './conversations.routes.js';
import customersRoutes from './customers.routes.js';
import messagesAuthRoutes from './messagesAuth.routes.js';
import orgAnalyticsRoutes from './orgAnalytics.routes.js';
import orgSettingsRoutes from './orgSettings.routes.js';
import orgAiRoutes from './orgAi.routes.js';
import orgKnowledgeRoutes from './orgKnowledge.routes.js';
import orgTagsRoutes from './orgTags.routes.js';
import assignmentRoutes from './assignment.routes.js';
import inboxesRoutes from './inboxes.routes.js';
import widgetAdminRoutes from './widgetAdmin.routes.js';
import orgSearchRoutes from './orgSearch.routes.js';
import {
  createInviteController,
  createInvitesBatchController,
  deleteMemberController,
  getCurrentMemberController,
  getMemberController,
  listMembersController,
  listPendingInvitesController,
  listWorkspaceChannelsController,
  patchMemberPermissionsController,
} from '../controllers/org.controller.js';
import {
  getTeammateProfileController,
  patchTeammateProfileController,
} from '../controllers/teammateProfile.controller.js';
import {
  createOrgTeammatePermissionRoleController,
  deleteOrgTeammatePermissionRoleController,
  listOrgTeammatePermissionRolesController,
  updateOrgTeammatePermissionRoleController,
} from '../controllers/orgTeammatePermissionRoles.controller.js';

/**
 * Authenticated org workspace mounted at `/api/org/:orgId`.
 * Membership is resolved from URL param only (never body/query).
 */
const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireOrgAccess());

router.get('/members', listMembersController);
router.get('/members/me', getCurrentMemberController);
router.get('/members/:memberId/profile', getTeammateProfileController);
router.patch('/members/:memberId/profile', patchTeammateProfileController);
router.get('/members/:memberId', getMemberController);
router.patch('/members/:memberId', patchMemberPermissionsController);
router.delete('/members/:memberId', deleteMemberController);
router.get('/channels', listWorkspaceChannelsController);
router.get('/audit/events', requirePermission('analytics.view_org'), listOrgAuditEventsController);
router.post('/invites/batch', requirePermission('team.invite'), createInvitesBatchController);
router.get('/invites', listPendingInvitesController);
router.post('/invite', requirePermission('team.invite'), createInviteController);
router.get('/teammate-permission-roles', listOrgTeammatePermissionRolesController);
router.post(
  '/teammate-permission-roles',
  requireRole('ADMIN'),
  createOrgTeammatePermissionRoleController,
);
router.patch(
  '/teammate-permission-roles/:roleId',
  requireRole('ADMIN'),
  updateOrgTeammatePermissionRoleController,
);
router.delete(
  '/teammate-permission-roles/:roleId',
  requireRole('ADMIN'),
  deleteOrgTeammatePermissionRoleController,
);
router.use('/settings', orgSettingsRoutes);
router.use('/ai', orgAiRoutes);
router.use('/knowledge', orgKnowledgeRoutes);
router.use('/tags', orgTagsRoutes);
router.use('/assignment', assignmentRoutes);
router.use('/inboxes', inboxesRoutes);
router.use('/analytics', orgAnalyticsRoutes);
router.use('/conversations', conversationsRoutes);
router.use('/customers', customersRoutes);
router.use('/messages', messagesAuthRoutes);
router.use('/widget', widgetAdminRoutes);
router.use('/search', orgSearchRoutes);

export default router;
