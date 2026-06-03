import { Router } from 'express';
import { requirePermission } from '../middleware/orgAccess.js';
import {
  listWidgetInstallationsController,
  createWidgetInstallationController,
  patchWidgetInstallationController,
  rotateWidgetSecretController,
  getWidgetSnippetController,
} from '../controllers/widgetAdmin.controller.js';

const router = Router({ mergeParams: true });

router.get('/installations', requirePermission('widget.view'), listWidgetInstallationsController);
router.post('/installations', requirePermission('widget.manage'), createWidgetInstallationController);
router.patch(
  '/installations/:installationId',
  requirePermission('widget.manage'),
  patchWidgetInstallationController,
);
router.post(
  '/installations/:installationId/rotate-secret',
  requirePermission('widget.manage'),
  rotateWidgetSecretController,
);
router.get(
  '/installations/:installationId/snippet',
  requirePermission('widget.view'),
  getWidgetSnippetController,
);

export default router;
