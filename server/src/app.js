import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import onboardingRoutes from './routes/onboarding.routes.js';
import customersRoutes from './routes/customers.routes.js';
import conversationsRoutes from './routes/conversations.routes.js';
import ticketsRoutes from './routes/tickets.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import aiRoutes from './routes/ai.routes.js';

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
app.use('/api/customers', customersRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/ai', aiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
