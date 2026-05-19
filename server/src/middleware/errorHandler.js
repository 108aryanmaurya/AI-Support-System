/**
 * Centralized error handler — keep controllers using `next(err)` for failures.
 */
export function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
  });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = err.status ?? err.statusCode ?? 500;
  const exposeClientMessage =
    status < 500 || status === 502 || status === 503 || status === 504;
  const message =
    !exposeClientMessage && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message ?? 'Internal Server Error';

  if (status >= 500 && !exposeClientMessage) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  if (err.retryAfterSeconds != null && Number.isFinite(err.retryAfterSeconds)) {
    res.setHeader('Retry-After', String(Math.ceil(err.retryAfterSeconds)));
  }

  res.status(status).json({
    error: message,
    ...(err.code ? { code: err.code } : {}),
    ...(err.retryAfterSeconds != null ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
    ...(process.env.NODE_ENV !== 'production' && err.stack ? { stack: err.stack } : {}),
  });
}
