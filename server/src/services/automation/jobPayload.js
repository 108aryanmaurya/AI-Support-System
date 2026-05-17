/**
 * Normalize `automation_jobs.payload` (JSONB object or legacy string).
 * @param {object} job
 */
export function parseAutomationJobPayload(job) {
  const raw = job?.payload;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}
