import { workflowTagAddedIdempotencyKey } from '@ai-support/shared';
import { emitAutomationJob } from './enqueueJob.service.js';
import { isWorkflowAutomationEnabled } from '../ai/workflowAiGates.service.js';

/**
 * Fire-and-forget: queue `tag_added` workflow evaluation for newly attached tags.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.conversationId
 * @param {string[]} params.tagIdsAdded
 */
export function scheduleWorkflowTagsAdded({ organizationId, conversationId, tagIdsAdded }) {
  const ids = [...new Set((tagIdsAdded ?? []).filter((id) => typeof id === 'string' && id.trim()))];
  if (!ids.length) return;

  void (async () => {
    try {
      if (!(await isWorkflowAutomationEnabled(organizationId))) return;

      for (const tagId of ids) {
        emitAutomationJob({
          organizationId,
          jobType: 'ai.workflow_tag_added',
          payload: { conversationId, tagId },
          idempotencyKey: workflowTagAddedIdempotencyKey(organizationId, conversationId, tagId),
          maxAttempts: 4,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[workflow] tag_added enqueue skipped', {
        organization_id: organizationId,
        conversation_id: conversationId,
        error: e?.message,
      });
    }
  })();
}
