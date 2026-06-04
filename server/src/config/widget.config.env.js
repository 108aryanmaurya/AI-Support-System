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

/** Browser Origin header is scheme+host+port only (no path). */
function toHttpOrigin(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url.trim()).origin;
  } catch {
    return null;
  }
}

export function widgetConfigFromEnv() {
  const jwtSecret =
    process.env.WIDGET_SESSION_JWT_SECRET?.trim() ||
    (!isProduction ? 'dev-widget-jwt-secret-change-in-production' : '');

  if (!jwtSecret) {
    throw new Error(
      'WIDGET_SESSION_JWT_SECRET is required in production. Set it in server/.env.',
    );
  }

  const apiPublicUrl = (
    process.env.WIDGET_API_PUBLIC_URL?.trim() ||
    process.env.PUBLIC_API_URL?.trim() ||
    'http://localhost:3001'
  ).replace(/\/$/, '');

  const iframeOrigin = (
    process.env.WIDGET_IFRAME_ORIGIN?.trim() || `${apiPublicUrl}/v1/messenger`
  ).replace(/\/$/, '');
  const cdnOrigin = (process.env.WIDGET_CDN_ORIGIN?.trim() || apiPublicUrl).replace(/\/$/, '');
  const extraCors = process.env.WIDGET_CORS_ORIGINS
    ? process.env.WIDGET_CORS_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return Object.freeze({
    jwtSecret,
    jwtIssuer: 'ai-support-widget',
    sessionTtlSec: parsePositiveInt(process.env.WIDGET_SESSION_TTL_SEC, 1800),
    sessionRefreshMaxSec: parsePositiveInt(process.env.WIDGET_SESSION_REFRESH_MAX_SEC, 604_800),
    /** Default lifetime when customer backend signs user JWTs (Intercom-style). */
    userJwtDefaultTtlSec: parsePositiveInt(process.env.WIDGET_USER_JWT_DEFAULT_TTL_SEC, 604_800),
    /** Reject user JWTs whose exp−iat exceeds this (cap abuse). Default 7 days. */
    userJwtMaxTtlSec: parsePositiveInt(process.env.WIDGET_USER_JWT_MAX_TTL_SEC, 604_800),
    iframeOrigin,
    cdnOrigin,
    apiPublicUrl,
    corsOrigins: [
      ...new Set(
        [
          toHttpOrigin(iframeOrigin),
          toHttpOrigin(cdnOrigin),
          ...extraCors.map((o) => toHttpOrigin(o) || o),
        ].filter(Boolean),
      ),
    ],
    devAllowInsecureIdentify: parseBool(process.env.WIDGET_DEV_ALLOW_INSECURE_IDENTIFY, !isProduction),
    devSkipDomainCheck: parseBool(process.env.WIDGET_DEV_SKIP_DOMAIN_CHECK, !isProduction),
    rateLimits: Object.freeze({
      bootstrapMax: parsePositiveInt(process.env.RATE_LIMIT_WIDGET_BOOTSTRAP_MAX, 30),
      bootstrapWindowMs: parsePositiveInt(process.env.RATE_LIMIT_WIDGET_BOOTSTRAP_WINDOW_MS, 60_000),
      msgVisitorMax: parsePositiveInt(process.env.RATE_LIMIT_WIDGET_MSG_VISITOR_MAX, 20),
      msgVisitorWindowMs: parsePositiveInt(process.env.RATE_LIMIT_WIDGET_MSG_VISITOR_WINDOW_MS, 60_000),
      msgInstMax: parsePositiveInt(process.env.RATE_LIMIT_WIDGET_MSG_INST_MAX, 500),
      msgInstWindowMs: parsePositiveInt(process.env.RATE_LIMIT_WIDGET_MSG_INST_WINDOW_MS, 60_000),
      identifyMax: parsePositiveInt(process.env.RATE_LIMIT_WIDGET_IDENTIFY_MAX, 60),
      identifyWindowMs: parsePositiveInt(process.env.RATE_LIMIT_WIDGET_IDENTIFY_WINDOW_MS, 60_000),
      refreshMax: parsePositiveInt(process.env.RATE_LIMIT_WIDGET_REFRESH_MAX, 60),
      refreshWindowMs: parsePositiveInt(process.env.RATE_LIMIT_WIDGET_REFRESH_WINDOW_MS, 60_000),
      typingTtlSec: parsePositiveInt(process.env.WIDGET_TYPING_TTL_SEC, 5),
    }),
  });
}
