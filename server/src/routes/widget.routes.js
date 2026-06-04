import { Router } from 'express';
import {
  widgetBootstrapController,
  widgetRefreshSessionController,
  widgetPreChatController,
  widgetIdentifyController,
  widgetListConversationsController,
  widgetCreateConversationController,
  widgetListMessagesController,
  widgetSendMessageController,
  widgetTypingController,
  widgetGetTypingController,
} from '../controllers/widget.controller.js';
import { widgetDevSignUserJwtController } from '../controllers/widgetDev.controller.js';
import { requireWidgetSession } from '../middleware/widgetAuth.js';
import {
  widgetBootstrapRateLimit,
  widgetRefreshRateLimit,
  widgetMessageVisitorRateLimit,
  widgetMessageInstRateLimit,
  widgetIdentifyRateLimit,
} from '../middleware/widgetRateLimit.js';

const router = Router();

router.get('/bootstrap', widgetBootstrapRateLimit, widgetBootstrapController);
router.post('/dev/sign-user-jwt', widgetDevSignUserJwtController);
router.post('/session/refresh', requireWidgetSession, widgetRefreshRateLimit, widgetRefreshSessionController);
router.post('/pre-chat', requireWidgetSession, widgetPreChatController);
router.post('/identify', widgetIdentifyRateLimit, requireWidgetSession, widgetIdentifyController);
router.get('/conversations', requireWidgetSession, widgetListConversationsController);
router.post('/conversations', requireWidgetSession, widgetCreateConversationController);
router.get(
  '/conversations/:conversationId/messages',
  requireWidgetSession,
  widgetListMessagesController,
);
router.post(
  '/conversations/:conversationId/messages',
  requireWidgetSession,
  widgetMessageVisitorRateLimit,
  widgetMessageInstRateLimit,
  widgetSendMessageController,
);
router.post(
  '/conversations/:conversationId/messages/send',
  requireWidgetSession,
  widgetMessageVisitorRateLimit,
  widgetMessageInstRateLimit,
  (req, res, next) => {
    req.params.conversationId = req.params.conversationId || req.body?.conversationId;
    return widgetSendMessageController(req, res, next);
  },
);
router.post('/messages/send', requireWidgetSession, widgetMessageVisitorRateLimit, widgetMessageInstRateLimit, widgetSendMessageController);
router.post('/conversations/:conversationId/typing', requireWidgetSession, widgetTypingController);
router.get('/conversations/:conversationId/typing', requireWidgetSession, widgetGetTypingController);

export default router;
