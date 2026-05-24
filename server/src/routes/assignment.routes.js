import { Router } from 'express';
import { requireRole } from '../middleware/orgAccess.js';
import { orgAssignmentPreviewRateLimit } from '../middleware/assignmentRateLimit.js';
import {
  getAgentAssignmentController,
  getAgentPresenceController,
  getAgentWorkloadController,
  getAssignmentMetricsController,
  getConversationAssignmentAuditController,
  getOrgAssignmentSettingsController,
  getOrgPresenceSnapshotController,
  postAssignmentPreviewController,
  postPresenceHeartbeatController,
  postPresenceOfflineController,
  putAgentAssignmentController,
  putOrgAssignmentSettingsController,
} from '../controllers/assignment.controller.js';

const router = Router({ mergeParams: true });

router.get('/settings', requireRole('ADMIN'), getOrgAssignmentSettingsController);
router.put('/settings', requireRole('ADMIN'), putOrgAssignmentSettingsController);
router.get('/metrics', getAssignmentMetricsController);
router.get('/conversations/:conversationId/audit', getConversationAssignmentAuditController);
router.post('/preview', orgAssignmentPreviewRateLimit, postAssignmentPreviewController);
router.post('/presence/heartbeat', postPresenceHeartbeatController);
router.post('/presence/offline', postPresenceOfflineController);
router.get('/presence', requireRole('ADMIN'), getOrgPresenceSnapshotController);
router.get('/agents/:memberId/presence', getAgentPresenceController);
router.get('/agents/:memberId/workload', getAgentWorkloadController);
router.get('/agents/:memberId', requireRole('ADMIN'), getAgentAssignmentController);
router.put('/agents/:memberId', requireRole('ADMIN'), putAgentAssignmentController);

export default router;
