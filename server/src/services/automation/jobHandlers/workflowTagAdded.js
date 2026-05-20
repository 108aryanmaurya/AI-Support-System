import { parseAutomationJobPayload } from '../jobPayload.js';

/**
 * @param {object} job
 */
export async function handleWorkflowTagAdded(job) {
  const p = parseAutomationJobPayload(job);
  const conversationId =
    typeof p.conversationId === 'string'
      ? p.conversationId.trim()
      : typeof p.conversation_id === 'string'
        ? p.conversation_id.trim()
        : '';
  const tagId =
    typeof p.tagId === 'string' ? p.tagId.trim() : typeof p.tag_id === 'string' ? p.tag_id.trim() : '';

  if (!conversationId || !tagId) {
    throw new Error('ai.workflow_tag_added payload requires conversationId and tagId');
  }

  // eslint-disable-next-line no-console
  console.info('[workflow] ai.workflow_tag_added stub (Sprint 5+)', {
    organization_id: job.organization_id,
    conversation_id: conversationId,
    tag_id: tagId,
    job_id: job.id,
  });
}
