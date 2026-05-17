import {
  KNOWLEDGE_MAX_UPLOAD_BYTES,
  isAllowedKnowledgeUploadMime,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { ensureOrgMembership } from '../support.service.js';
import { enqueueAutomationJob } from '../automation/enqueueJob.service.js';
import { checksumBuffer } from './knowledgeIngest.service.js';

function isMissingSourceTable(error) {
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.message?.includes('knowledge_sources')
  );
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.actorUserId
 * @param {string} params.fileName
 * @param {string} params.mimeType
 * @param {Buffer} params.buffer
 */
export async function createFileKnowledgeSource({
  organizationId,
  actorUserId,
  fileName,
  mimeType,
  buffer,
}) {
  const member = await ensureOrgMembership(actorUserId, organizationId);

  const trimmedName = typeof fileName === 'string' ? fileName.trim() : '';
  if (!trimmedName || trimmedName.length > 255) {
    throw new HttpError(400, 'fileName is required (max 255 characters).');
  }

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new HttpError(400, 'file content is required.');
  }
  if (buffer.length === 0) {
    throw new HttpError(400, 'File is empty.');
  }
  if (buffer.length > KNOWLEDGE_MAX_UPLOAD_BYTES) {
    throw new HttpError(
      400,
      `File exceeds maximum size of ${Math.round(KNOWLEDGE_MAX_UPLOAD_BYTES / 1024)} KB.`,
    );
  }

  const mime = String(mimeType ?? '').toLowerCase().split(';')[0].trim();
  if (!isAllowedKnowledgeUploadMime(mime)) {
    throw new HttpError(400, 'Unsupported file type. Allowed: text/plain, text/markdown, application/pdf.');
  }

  const checksum = checksumBuffer(buffer);
  const idempotencyKey = `knowledge:ingest:${organizationId}:${checksum}`;

  const { data: existing } = await supabaseAdmin
    .from('knowledge_sources')
    .select('id, status, source_metadata')
    .eq('organization_id', organizationId)
    .eq('type', 'file')
    .filter('source_metadata->>checksum', 'eq', checksum)
    .in('status', ['pending', 'processing', 'processed', 'retrying'])
    .is('deleted_at', null)
    .maybeSingle();

  if (existing?.id) {
    let jobId = null;
    if (['pending', 'failed', 'retrying'].includes(existing.status)) {
      const enqueue = await enqueueAutomationJob({
        organizationId,
        jobType: 'knowledge.ingest_source',
        payload: { sourceId: existing.id },
        idempotencyKey: `knowledge:job:retry:${existing.id}:${Date.now()}`,
        maxAttempts: 5,
      });
      jobId = enqueue.jobId;
    }
    return { source: existing, duplicate: true, jobId };
  }

  const source_metadata = {
    fileName: trimmedName,
    mimeType: mime,
    checksum,
    sourceType: 'file',
    uploadedByMemberId: member.id,
    uploadedByUserId: actorUserId,
    contentBase64: buffer.toString('base64'),
  };

  const { data: source, error } = await supabaseAdmin
    .from('knowledge_sources')
    .insert({
      organization_id: organizationId,
      type: 'file',
      status: 'pending',
      source_metadata,
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingSourceTable(error)) {
      throw new HttpError(503, 'Knowledge sources are not available. Apply database migrations.');
    }
    throw new HttpError(500, error.message || 'Failed to create knowledge source.');
  }

  const enqueue = await enqueueAutomationJob({
    organizationId,
    jobType: 'knowledge.ingest_source',
    payload: { sourceId: source.id },
    idempotencyKey: `knowledge:job:${source.id}`,
    maxAttempts: 5,
  });

  return { source, jobId: enqueue.jobId, duplicate: false };
}

export async function listKnowledgeSources(organizationId, { status, limit = 50 } = {}) {
  let q = supabaseAdmin
    .from('knowledge_sources')
    .select('id, organization_id, type, status, source_metadata, last_synced_at, created_at, updated_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100));

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) {
    if (isMissingSourceTable(error)) {
      throw new HttpError(503, 'Knowledge sources are not available. Apply database migrations.');
    }
    throw new HttpError(500, error.message || 'Failed to list sources.');
  }

  const sources = (data ?? []).map((row) => {
    const meta = row.source_metadata && typeof row.source_metadata === 'object'
      ? { ...row.source_metadata }
      : {};
    delete meta.contentBase64;
    return { ...row, source_metadata: meta };
  });

  return { sources };
}

/**
 * Re-queue ingest for pending/failed source.
 */
export async function syncKnowledgeSource({ organizationId, sourceId, actorUserId }) {
  await ensureOrgMembership(actorUserId, organizationId);

  const { data: source, error } = await supabaseAdmin
    .from('knowledge_sources')
    .select('*')
    .eq('id', sourceId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load source.');
  if (!source) throw new HttpError(404, 'Source not found.');

  if (source.status === 'processed') {
    return { source, skipped: true, reason: 'already_processed' };
  }

  if (source.status === 'processing') {
    return { source, skipped: true, reason: 'already_processing' };
  }

  await supabaseAdmin
    .from('knowledge_sources')
    .update({ status: 'retrying', updated_at: new Date().toISOString() })
    .eq('id', sourceId)
    .eq('organization_id', organizationId);

  const enqueue = await enqueueAutomationJob({
    organizationId,
    jobType: 'knowledge.ingest_source',
    payload: { sourceId },
    idempotencyKey: `knowledge:retry:${sourceId}:${Date.now()}`,
    maxAttempts: 5,
  });

  return { source, jobId: enqueue.jobId, skipped: false };
}
