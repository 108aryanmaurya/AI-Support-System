import { createHash } from 'node:crypto';
import {
  isAllowedKnowledgeUploadMime,
  KNOWLEDGE_MAX_UPLOAD_BYTES,
  normalizeKnowledgeSlug,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { parseAutomationJobPayload } from '../automation/jobPayload.js';
import { emitSupportEvent } from '../analytics/supportEvents.service.js';
import {
  createKnowledgeArticle,
  publishKnowledgeArticle,
} from './knowledge.service.js';

function extFromName(fileName) {
  const i = String(fileName ?? '').lastIndexOf('.');
  return i >= 0 ? String(fileName).slice(i).toLowerCase() : '';
}

function mimeFromExt(ext) {
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  return 'text/plain';
}

function resolveMime(mimeType, fileName) {
  const m = String(mimeType ?? '').toLowerCase().split(';')[0].trim();
  if (m && isAllowedKnowledgeUploadMime(m)) return m;
  const fromExt = mimeFromExt(extFromName(fileName));
  if (isAllowedKnowledgeUploadMime(fromExt)) return fromExt;
  return null;
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} fileName
 */
export async function extractTextFromUpload(buffer, mimeType, fileName) {
  const mime = resolveMime(mimeType, fileName);
  if (!mime) {
    throw new HttpError(400, 'Unsupported file type. Allowed: .txt, .md, .pdf');
  }

  if (mime === 'application/pdf') {
    try {
      const mod = await import('pdf-parse/lib/pdf-parse.js');
      const pdfParse = mod.default ?? mod;
      const parsed = await pdfParse(buffer);
      return String(parsed?.text ?? '').trim();
    } catch (e) {
      throw new HttpError(400, e?.message || 'Failed to parse PDF.');
    }
  }

  return buffer.toString('utf8').trim();
}

export function checksumBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function titleFromFileName(fileName) {
  const base = String(fileName ?? 'document')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return base.slice(0, 500) || 'Imported document';
}

async function markSourceFailed(organizationId, sourceId, meta, message, actorMemberId) {
  const { error } = await supabaseAdmin
    .from('knowledge_sources')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
      source_metadata: {
        ...meta,
        lastError: message.slice(0, 500),
      },
    })
    .eq('id', sourceId)
    .eq('organization_id', organizationId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[knowledge-ingest] failed to mark source failed', {
      sourceId,
      error: error.message,
    });
  }

  emitSupportEvent({
    organizationId,
    eventType: 'knowledge.ingest_failed',
    entityType: 'article',
    entityId: sourceId,
    actorMemberId,
    payload: {
      sourceId,
      fileName: meta.fileName,
      error: message.slice(0, 200),
    },
  });
}

/**
 * Process a file source: extract → article → publish → chunks.
 * @param {object} job
 */
export async function processKnowledgeSourceIngest(job) {
  const organizationId = job.organization_id;
  const payload = parseAutomationJobPayload(job);
  const sourceId = payload.sourceId ?? payload.source_id;

  let meta = {};
  let actorMemberId = null;
  let fileName = 'document.txt';

  try {
    if (!sourceId) {
      throw new Error('sourceId required in job payload.');
    }

    const { data: source, error: loadErr } = await supabaseAdmin
      .from('knowledge_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (loadErr) {
      throw new Error(loadErr.message || 'Failed to load knowledge source.');
    }
    if (!source) {
      throw new Error('Knowledge source not found.');
    }

    if (source.status === 'processed' && source.source_metadata?.articleId) {
      return;
    }

    meta =
      source.source_metadata && typeof source.source_metadata === 'object'
        ? { ...source.source_metadata }
        : {};

    fileName = meta.fileName ?? 'document.txt';
    const mimeType = meta.mimeType ?? 'text/plain';
    const contentBase64 = meta.contentBase64 ?? meta.content_base64;
    actorMemberId = meta.uploadedByMemberId ?? null;

    if (!contentBase64 || typeof contentBase64 !== 'string') {
      throw new Error(
        'Source is missing stored file content. Re-upload the file or call POST .../sources/:id/sync after fixing storage.',
      );
    }

    const { error: procErr } = await supabaseAdmin
      .from('knowledge_sources')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', sourceId)
      .eq('organization_id', organizationId);

    if (procErr) {
      throw new Error(procErr.message || 'Failed to mark source as processing.');
    }

    const buffer = Buffer.from(contentBase64, 'base64');
    if (buffer.length > KNOWLEDGE_MAX_UPLOAD_BYTES) {
      throw new HttpError(400, 'File exceeds maximum upload size.');
    }

    const text = await extractTextFromUpload(buffer, mimeType, fileName);
    if (!text) {
      throw new HttpError(400, 'No extractable text in file.');
    }

    const title = titleFromFileName(fileName);
    let slug;
    try {
      slug = normalizeKnowledgeSlug(title);
    } catch {
      slug = normalizeKnowledgeSlug(title, `import-${Date.now()}`);
    }

    const actorUserId = meta.uploadedByUserId ?? meta.uploaded_by_user_id;
    if (!actorUserId) {
      throw new Error('uploadedByUserId missing on source metadata.');
    }

    let article;
    let slugAttempt = slug;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const created = await createKnowledgeArticle({
          organizationId,
          actorUserId,
          title,
          slug: slugAttempt,
          content: text,
          visibility: 'internal',
        });
        article = created.article;
        break;
      } catch (e) {
        if (e?.status === 409 && attempt < 4) {
          slugAttempt = normalizeKnowledgeSlug(title, `${slug}-${attempt + 2}`);
          continue;
        }
        throw e;
      }
    }
    if (!article) {
      throw new HttpError(500, 'Failed to create article from upload.');
    }

    const { error: linkErr } = await supabaseAdmin
      .from('knowledge_articles')
      .update({ source_id: sourceId })
      .eq('id', article.id)
      .eq('organization_id', organizationId);

    if (linkErr) {
      throw new HttpError(500, linkErr.message || 'Failed to link article to source.');
    }

    const published = await publishKnowledgeArticle({
      organizationId,
      articleId: article.id,
      actorUserId,
    });

    const cleanMeta = {
      fileName,
      mimeType,
      checksum: meta.checksum,
      sourceType: 'file',
      uploadedByMemberId: actorMemberId,
      articleId: article.id,
    };

    const { error: doneErr } = await supabaseAdmin
      .from('knowledge_sources')
      .update({
        status: 'processed',
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_metadata: cleanMeta,
      })
      .eq('id', sourceId)
      .eq('organization_id', organizationId);

    if (doneErr) {
      throw new HttpError(500, doneErr.message || 'Failed to mark source as processed.');
    }

    emitSupportEvent({
      organizationId,
      eventType: 'knowledge.ingest_completed',
      entityType: 'article',
      entityId: article.id,
      actorMemberId,
      payload: { sourceId, fileName, chunkCount: published.chunkCount ?? 0 },
    });
  } catch (e) {
    const message = e?.message || String(e) || 'Ingest failed';
    // eslint-disable-next-line no-console
    console.error('[knowledge-ingest] job failed', {
      organizationId,
      sourceId: sourceId ?? null,
      jobId: job.id,
      message,
    });

    if (sourceId) {
      await markSourceFailed(organizationId, sourceId, meta, message, actorMemberId);
    }
    throw e;
  }
}
