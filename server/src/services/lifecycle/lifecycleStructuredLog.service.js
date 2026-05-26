/**
 * Structured JSON logs for conversation lifecycle automation (cron / worker).
 */

/**
 * @param {'info' | 'warn' | 'error'} level
 * @param {Record<string, unknown>} fields
 */
export function logLifecycleStructured(level, fields) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    component: 'lifecycle',
    ...fields,
  });

  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}
