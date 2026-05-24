/**
 * Structured JSON logs for intelligent assignment (Sprint 8+).
 * No message bodies or customer PII.
 */

/**
 * @param {'info' | 'warn' | 'error'} level
 * @param {Record<string, unknown>} fields
 */
export function logAssignmentStructured(level, fields) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    component: 'assignment',
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
