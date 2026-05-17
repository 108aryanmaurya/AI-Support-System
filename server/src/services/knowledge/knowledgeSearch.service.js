import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';

const MAX_QUERY_LENGTH = 200;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function isMissingSearchRpc(error) {
  return (
    error?.code === '42883' ||
    error?.code === 'PGRST202' ||
    error?.message?.includes('search_knowledge_chunks')
  );
}

/**
 * Postgres FTS via `search_knowledge_chunks` RPC.
 * @param {{ organizationId: string, query: string, limit?: number }} params
 */
export async function searchKnowledgeChunks({ organizationId, query, limit = DEFAULT_LIMIT }) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) {
    throw new HttpError(400, 'q is required.');
  }
  if (q.length > MAX_QUERY_LENGTH) {
    throw new HttpError(400, `q must be at most ${MAX_QUERY_LENGTH} characters.`);
  }

  const cappedLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT);

  const { data, error } = await supabaseAdmin.rpc('search_knowledge_chunks', {
    p_organization_id: organizationId,
    p_query: q,
    p_limit: cappedLimit,
  });

  if (error) {
    if (isMissingSearchRpc(error)) {
      throw new HttpError(503, 'Knowledge search is not available. Apply database migrations.');
    }
    throw new HttpError(500, error.message || 'Knowledge search failed.');
  }

  const rows = data ?? [];
  return {
    query: q,
    results: rows.map((row) => ({
      chunkId: row.chunk_id,
      chunkIndex: row.chunk_index,
      excerpt: row.content,
      rank: row.rank,
      article: {
        id: row.article_id,
        title: row.article_title,
        slug: row.article_slug,
        visibility: row.article_visibility,
        status: row.article_status,
        updatedAt: row.article_updated_at,
      },
    })),
    total: rows.length,
  };
}
