import { assembleKnowledgeContext } from '../../knowledge/contextAssembly.service.js';
import { retrieveKnowledge } from '../../knowledge/retrieval.service.js';
import { scrubPii } from '../utils/piiFilter.js';
import { wrapUntrustedContext } from '../utils/promptInjection.js';

/**
 * RAG context for copilot prompts (keyword retrieval + assembly).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.query
 * @param {string} params.memberId
 * @param {number} [params.limit]
 * @param {number} [params.maxTokens]
 * @returns {Promise<{ text: string, chunkIds: string[] | null, available: boolean }>}
 */
export async function loadKnowledgeContextForAssist({
  organizationId,
  query,
  memberId,
  limit = 5,
  maxTokens = 2000,
}) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) {
    return { text: '', chunkIds: null, available: false };
  }

  const retrieval = await retrieveKnowledge({
    organizationId,
    query: q,
    mode: 'keyword',
    limit,
    memberId,
  });

  if (!retrieval.available || !retrieval.results?.length) {
    return { text: '', chunkIds: null, available: retrieval.available };
  }

  const assembled = assembleKnowledgeContext({
    chunks: retrieval.results,
    maxTokens,
  });

  const scrubbed = scrubPii(assembled.text);
  const wrapped = scrubbed
    ? wrapUntrustedContext('knowledge_base', scrubbed)
    : '';

  const chunkIds = retrieval.results.map((r) => r.chunkId).filter(Boolean);

  return {
    text: wrapped,
    chunkIds: chunkIds.length ? chunkIds : null,
    available: true,
  };
}
