import { WORKFLOW_AUTOMATION_JOB_TYPES } from './workflowAutomationJobTypes.js';

/** Lifecycle cron / worker job types (conversation-status-handling). */
export const LIFECYCLE_AUTOMATION_JOB_TYPES = Object.freeze([
  'lifecycle.scan_org',
  'lifecycle.auto_close_resolved',
  'lifecycle.send_customer_reminder',
  'lifecycle.auto_close_waiting',
]);

/** Durable job types for `automation_jobs.job_type`. */
export const AUTOMATION_JOB_TYPES = Object.freeze([
  'notify.staff_inbound',
  'notify.sla_warning',
  'notify.assignment',
  'sla.scan_org',
  ...LIFECYCLE_AUTOMATION_JOB_TYPES,
  'knowledge.ingest_source',
  'ai.classify_inbound',
  'assignment.auto_route',
  'assignment.reassign',
  ...WORKFLOW_AUTOMATION_JOB_TYPES,
]);

/** @param {unknown} v */
export function isAutomationJobType(v) {
  return typeof v === 'string' && AUTOMATION_JOB_TYPES.includes(v);
}
