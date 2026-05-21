/**
 * Structured workflow automation logs (no message bodies).
 *
 * @param {object} entry
 */
export function logWorkflowEvent(entry) {
  const line = {
    scope: 'workflow',
    ts: new Date().toISOString(),
    ...entry,
  };
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(line));
}
