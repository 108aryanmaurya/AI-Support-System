import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  acceptInviteController,
  createOrgController,
  getInviteByTokenController,
  listMyOrgsController,
} from '../controllers/org.controller.js';

const router = Router();

router.post('/create', requireAuth, createOrgController);
router.get('/my', requireAuth, listMyOrgsController);

router.get('/invite/:token', getInviteByTokenController);

router.post('/accept-invite', requireAuth, acceptInviteController);

export default router;
