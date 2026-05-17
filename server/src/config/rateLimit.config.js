/**
 * Rate-limit configuration — Redis only (shared across API replicas).
 * Requires REDIS_URL in server/.env.
 */

function parsePositiveInt(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseBool(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';
const redisUrl = process.env.REDIS_URL?.trim() || '';

if (!redisUrl) {
  throw new Error(
    'REDIS_URL is required (rate limits use Redis only). ' +
      'Local: docker compose -f docker-compose.redis.yml up -d then REDIS_URL=redis://localhost:6379',
  );
}

export const rateLimitConfig = Object.freeze({
  redisUrl,
  redisKeyPrefix: process.env.RATE_LIMIT_REDIS_KEY_PREFIX?.trim() || 'rl:',
  /** When true, Redis errors return 503; when false, allow request through. */
  redisFailClosed: parseBool(process.env.RATE_LIMIT_REDIS_FAIL_CLOSED, isProduction),

  incoming: Object.freeze({
    orgWindowMs: parsePositiveInt(process.env.RATE_LIMIT_INCOMING_ORG_WINDOW_MS, 60_000),
    emailWindowMs: parsePositiveInt(process.env.RATE_LIMIT_INCOMING_EMAIL_WINDOW_MS, 60_000),
    orgMax: parsePositiveInt(process.env.RATE_LIMIT_INCOMING_ORG_MAX, 120),
    emailMax: parsePositiveInt(process.env.RATE_LIMIT_INCOMING_EMAIL_MAX, 20),
  }),

  webhookEmail: Object.freeze({
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_WEBHOOK_EMAIL_WINDOW_MS, 60_000),
    max: parsePositiveInt(process.env.RATE_LIMIT_WEBHOOK_EMAIL_MAX, 60),
  }),

  ai: Object.freeze({
    userWindowMs: parsePositiveInt(process.env.RATE_LIMIT_AI_USER_WINDOW_MS, 60_000),
    userMax: parsePositiveInt(process.env.RATE_LIMIT_AI_USER_MAX, 30),
    orgWindowMs: parsePositiveInt(process.env.RATE_LIMIT_AI_ORG_WINDOW_MS, 60_000),
    orgMax: parsePositiveInt(process.env.RATE_LIMIT_AI_ORG_MAX, 60),
    orgUserMax: parsePositiveInt(process.env.RATE_LIMIT_AI_ORG_USER_MAX, 20),
  }),

  agentSend: Object.freeze({
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_AGENT_SEND_WINDOW_MS, 60_000),
    max: parsePositiveInt(process.env.RATE_LIMIT_AGENT_SEND_MAX, 90),
  }),

  knowledge: Object.freeze({
    searchOrgWindowMs: parsePositiveInt(process.env.RATE_LIMIT_KNOWLEDGE_SEARCH_ORG_WINDOW_MS, 60_000),
    searchOrgMax: parsePositiveInt(process.env.RATE_LIMIT_KNOWLEDGE_SEARCH_ORG_MAX, 120),
    searchOrgUserMax: parsePositiveInt(process.env.RATE_LIMIT_KNOWLEDGE_SEARCH_USER_MAX, 40),
    uploadOrgWindowMs: parsePositiveInt(process.env.RATE_LIMIT_KNOWLEDGE_UPLOAD_ORG_WINDOW_MS, 60_000),
    uploadOrgMax: parsePositiveInt(process.env.RATE_LIMIT_KNOWLEDGE_UPLOAD_ORG_MAX, 30),
    uploadOrgUserMax: parsePositiveInt(process.env.RATE_LIMIT_KNOWLEDGE_UPLOAD_USER_MAX, 10),
  }),

  outboundMonitor: Object.freeze({
    logDedupeMs: parsePositiveInt(process.env.OUTBOUND_FAILURE_LOG_DEDUPE_MS, 60_000),
  }),
});
