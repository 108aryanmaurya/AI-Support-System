import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import onboardingRoutes from './routes/onboarding.routes.js';
import ticketsRoutes from './routes/tickets.routes.js';
import aiRoutes from './routes/ai.routes.js';
import emailWebhookRoutes from './routes/emailWebhook.routes.js';
import orgRoutes from './routes/org.routes.js';
import orgWorkspaceRoutes from './routes/orgWorkspace.routes.js';
import messagesIncomingRoutes from './routes/messagesIncoming.routes.js';

const app = express();

app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'ai-support-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/org', orgRoutes);
// Org scope from URL only (`/api/org/:orgId/*`). Incoming ingress first so it skips JWT + membership.
app.use('/api/org/:orgId', messagesIncomingRoutes);
app.use('/api/org/:orgId', orgWorkspaceRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/webhooks', emailWebhookRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
