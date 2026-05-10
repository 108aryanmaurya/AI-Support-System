import { Router } from 'express';
import { createIncomingMessageController } from '../controllers/messages.controller.js';
import { incomingMessageRateLimit } from '../middleware/incomingRateLimit.js';

/** Rate-limited public ingress; org scope comes only from `/api/org/:orgId` (no JWT). */
const router = Router({ mergeParams: true });

router.post('/messages/incoming', incomingMessageRateLimit, createIncomingMessageController);

export default router;
