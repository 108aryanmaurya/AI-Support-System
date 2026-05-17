/**
 * Assembles retrieved chunks into a bounded context string for future LLM prompts.
 * Minimal implementation for Phase 2 — expanded in Phase 3/5 RAG.
 *
 * @param {object} params
 * @param {Array<{ excerpt: string, article?: { title?: string } }>} params.chunks
 * @param {number} [params.maxTokens=4000]
 */
export function assembleKnowledgeContext({ chunks, maxTokens = 4000 }) {
  const maxChars = Math.max(500, maxTokens * 4);
  const parts = [];
  let used = 0;

  for (const chunk of chunks ?? []) {
    const title = chunk.article?.title ? `[${chunk.article.title}]\n` : '';
    const block = `${title}${chunk.excerpt ?? ''}`.trim();
    if (!block) continue;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length + 2;
  }

  return {
    text: parts.join('\n\n'),
    chunkCount: parts.length,
    truncated: parts.length < (chunks?.length ?? 0),
  };
}
