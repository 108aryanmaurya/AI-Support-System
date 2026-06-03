import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { widgetConfig } from './config/widget.config.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import aiRoutes from './routes/ai.routes.js';
import emailWebhookRoutes from './routes/emailWebhook.routes.js';
import orgRoutes from './routes/org.routes.js';
import orgWorkspaceRoutes from './routes/orgWorkspace.routes.js';
import messagesIncomingRoutes from './routes/messagesIncoming.routes.js';
import internalCronRoutes from './routes/internalCron.routes.js';
import internalOpsRoutes from './routes/internalOps.routes.js';
import widgetRoutes from './routes/widget.routes.js';
import widgetAdminRoutes from './routes/widgetAdmin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const app = express();

const corsOrigins = [...new Set([...env.corsOrigins, ...widgetConfig.corsOrigins])];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      if (env.nodeEnv !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);

app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      if (req.originalUrl?.startsWith('/api/webhooks')) {
        req.rawBody = buf.toString('utf8');
      }
    },
  }),
);
app.use(requestLogger);

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'ai-support-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/org', orgRoutes);
// Org scope from URL only (`/api/org/:orgId/*`). Incoming ingress first so it skips JWT + membership.
app.use('/api/org/:orgId', messagesIncomingRoutes);
app.use('/api/org/:orgId', orgWorkspaceRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/webhooks', emailWebhookRoutes);
app.use('/api/internal/cron', internalCronRoutes);
app.use('/api/internal/ops', internalOpsRoutes);
app.use('/api/widget/v1', widgetRoutes);

const widgetStaticRoot = path.join(repoRoot, 'messenger-web');
app.use('/v1', express.static(path.join(widgetStaticRoot, 'loader/dist'), { maxAge: '1h' }));
app.use(
  '/v1/messenger',
  express.static(path.join(widgetStaticRoot, 'messenger/dist'), { index: 'index.html' }),
);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
