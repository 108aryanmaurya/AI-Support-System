import { processKnowledgeSourceIngest } from '../../knowledge/knowledgeIngest.service.js';

/**
 * @param {object} job — automation_jobs row
 */
export async function handleKnowledgeIngestSource(job) {
  await processKnowledgeSourceIngest(job);
}
