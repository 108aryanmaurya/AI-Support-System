import { createHash } from 'node:crypto';
import { KNOWLEDGE_MAX_CHUNKS_PER_VERSION } from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';

/** ~600 tokens at ~4 chars/token. */
const CHUNK_CHARS = 2400;
/** 15% overlap between consecutive chunks. */
const OVERLAP_CHARS = 360;

export function hashContent(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function estimateTokenCount(text) {
  return Math.max(1, Math.ceil(String(text).length / 4));
}

function chunkChecksum(content, startOffset, endOffset) {
  return createHash('sha256')
    .update(`${startOffset}:${endOffset}:${content}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

/**
 * Split article text into overlapping chunks for retrieval.
 * @param {string} content
 * @returns {Array<{ chunk_index: number, content: string, token_count: number, start_offset: number, end_offset: number, checksum: string, metadata: object }>}
 */
export function generateChunksFromContent(content) {
  const text = String(content ?? '');
  if (!text.trim()) {
    return [
      {
        chunk_index: 0,
        content: '',
        token_count: 0,
        start_offset: 0,
        end_offset: 0,
        checksum: chunkChecksum('', 0, 0),
        metadata: {},
      },
    ];
  }

  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < text.length && index < KNOWLEDGE_MAX_CHUNKS_PER_VERSION) {
    let end = Math.min(start + CHUNK_CHARS, text.length);

    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastPara = slice.lastIndexOf('\n\n');
      const lastSent = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'));
      if (lastPara > slice.length - 500) {
        end = start + lastPara + 2;
      } else if (lastSent > 200) {
        end = start + lastSent + 2;
      }
    }

    if (end <= start) {
      end = Math.min(start + CHUNK_CHARS, text.length);
    }

    const piece = text.slice(start, end).trim();
    if (piece) {
      chunks.push({
        chunk_index: index,
        content: piece,
        token_count: estimateTokenCount(piece),
        start_offset: start,
        end_offset: end,
        checksum: chunkChecksum(piece, start, end),
        metadata: {},
      });
      index += 1;
    }

    if (end >= text.length) break;
    const nextStart = Math.max(0, end - OVERLAP_CHARS);
    start = nextStart > start ? nextStart : end;
  }

  if (index >= KNOWLEDGE_MAX_CHUNKS_PER_VERSION && start < text.length) {
    throw new HttpError(400, `Content exceeds maximum chunk count (${KNOWLEDGE_MAX_CHUNKS_PER_VERSION}).`);
  }

  return chunks;
}

/**
 * Replace all chunks for a version (delete prior, insert new).
 * @param {{ organizationId: string, articleVersionId: string, content: string }} params
 */
export async function replaceChunksForVersion({ organizationId, articleVersionId, content }) {
  const chunks = generateChunksFromContent(content);

  const { error: delError } = await supabaseAdmin
    .from('knowledge_chunks')
    .delete()
    .eq('article_version_id', articleVersionId)
    .eq('organization_id', organizationId);

  if (delError) {
    throw new HttpError(500, delError.message || 'Failed to clear existing chunks.');
  }

  if (chunks.length === 0) return [];

  const rows = chunks.map((c) => ({
    organization_id: organizationId,
    article_version_id: articleVersionId,
    chunk_index: c.chunk_index,
    content: c.content,
    token_count: c.token_count,
    start_offset: c.start_offset,
    end_offset: c.end_offset,
    checksum: c.checksum,
    metadata: c.metadata,
  }));

  const { data, error } = await supabaseAdmin.from('knowledge_chunks').insert(rows).select('id, chunk_index');

  if (error) {
    throw new HttpError(500, error.message || 'Failed to insert knowledge chunks.');
  }

  return data ?? [];
}
