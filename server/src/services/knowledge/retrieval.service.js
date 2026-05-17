import { searchKnowledgeChunks } from './knowledgeSearch.service.js';

/**
 * Retrieval abstraction — keyword search today; semantic/hybrid in Phase 5.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.query
 * @param {'keyword' | 'semantic' | 'hybrid'} [params.mode='keyword']
 * @param {number} [params.limit]
 * @param {string | null} [params.memberId] — reserved for visibility filtering
 */
export async function retrieveKnowledge({
  organizationId,
  query,
  mode = 'keyword',
  limit,
  memberId: _memberId = null,
}) {
  if (mode === 'semantic' || mode === 'hybrid') {
    return {
      mode,
      available: false,
      message: 'Semantic retrieval is available in a later phase. Use mode=keyword.',
      results: [],
      total: 0,
    };
  }

  const search = await searchKnowledgeChunks({ organizationId, query, limit });
  return {
    mode: 'keyword',
    available: true,
    query: search.query,
    results: search.results,
    total: search.total,
  };
}
