import { Router } from 'express';
import { requirePermission, requireRole } from '../middleware/orgAccess.js';
import {
  getOrgAiSettingsController,
  getOrgGeneralSettingsController,
  getOrgLifecycleSettingsController,
  patchOrgAiSettingsController,
  patchOrgGeneralSettingsController,
  patchOrgLifecycleSettingsController,
  postOrgGeneralDeletionRequestController,
} from '../controllers/orgSettings.controller.js';
import {
  getOrgPermissionsController,
  patchOrgPermissionsController,
} from '../controllers/orgPermissions.controller.js';
import {
  deleteOrgEmailSettingsController,
  getOrgEmailSettingsController,
  patchOrgEmailAddressesController,
  postOrgEmailDomainController,
  postOrgEmailDomainVerifyController,
  postOrgEmailForwardingConfirmController,
  postOrgEmailForwardingController,
  postOrgEmailSendingDomainController,
} from '../controllers/orgEmailSettings.controller.js';

const router = Router({ mergeParams: true });

router.get('/general', getOrgGeneralSettingsController);
router.patch('/general', patchOrgGeneralSettingsController);
router.post('/general/request-deletion', postOrgGeneralDeletionRequestController);

router.get('/permissions', getOrgPermissionsController);
router.patch(
  '/permissions',
  requirePermission('team.configure_permissions'),
  patchOrgPermissionsController,
);

router.get('/ai', getOrgAiSettingsController);
router.patch('/ai', requireRole('ADMIN'), patchOrgAiSettingsController);

router.get('/lifecycle', getOrgLifecycleSettingsController);
router.patch('/lifecycle', requireRole('ADMIN'), patchOrgLifecycleSettingsController);

router.get('/email', getOrgEmailSettingsController);
router.post('/email/forwarding', requireRole('ADMIN'), postOrgEmailForwardingController);
router.post('/email/forwarding/confirm', requireRole('ADMIN'), postOrgEmailForwardingConfirmController);
router.post('/email/sending-domain', requireRole('ADMIN'), postOrgEmailSendingDomainController);
router.post('/email/domain', requireRole('ADMIN'), postOrgEmailDomainController);
router.post('/email/domain/verify', requireRole('ADMIN'), postOrgEmailDomainVerifyController);
router.patch('/email/addresses', requireRole('ADMIN'), patchOrgEmailAddressesController);
router.delete('/email', requireRole('ADMIN'), deleteOrgEmailSettingsController);

export default router;
