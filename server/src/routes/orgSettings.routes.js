import { Router } from 'express';
import { requireRole } from '../middleware/orgAccess.js';
import {
  getOrgAiSettingsController,
  patchOrgAiSettingsController,
} from '../controllers/orgSettings.controller.js';

const router = Router({ mergeParams: true });

router.get('/ai', getOrgAiSettingsController);
router.patch('/ai', requireRole('ADMIN'), patchOrgAiSettingsController);

export default router;
