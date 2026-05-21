import { parseAutomationJobPayload } from '../jobPayload.js';
import { runTagAddedWorkflowAutomation } from '../../ai/workflowRules.service.js';

/**
 * Apply workflow rules for `tag_added` trigger.
 *
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

  await runTagAddedWorkflowAutomation({
    organizationId: job.organization_id,
    conversationId,
    tagId,
  });
}
