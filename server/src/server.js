// Load dotenv before any module that reads process.env at import time
import 'dotenv/config';

import app from './app.js';
import { env } from './config/env.js';
import { closeRedis, connectRedis } from './config/redis.js';

async function startServer() {
  try {
    await connectRedis();
    // eslint-disable-next-line no-console
    console.log('[redis] connected for rate limiting');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[redis] failed to connect on startup:', e?.message ?? e);
    process.exit(1);
  }

  return app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

const server = await startServer();

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`${signal} received, closing server`);
  await closeRedis();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
