/** Durable job types for `automation_jobs.job_type`. */
export const AUTOMATION_JOB_TYPES = Object.freeze([
  'notify.staff_inbound',
  'notify.assignment',
  'sla.scan_org',
]);

/** @param {unknown} v */
export function isAutomationJobType(v) {
  return typeof v === 'string' && AUTOMATION_JOB_TYPES.includes(v);
}
