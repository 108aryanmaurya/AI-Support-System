/** Phase 4 durable job types (handlers registered in automation worker). */
export const WORKFLOW_AUTOMATION_JOB_TYPES = Object.freeze([
  'ai.workflow_inbound',
  'ai.workflow_tag_added',
  'ai.workflow_sla',
]);

/** @param {unknown} v */
export function isWorkflowAutomationJobType(v) {
  return typeof v === 'string' && WORKFLOW_AUTOMATION_JOB_TYPES.includes(v);
}
