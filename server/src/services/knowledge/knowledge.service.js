import {
  KNOWLEDGE_ARTICLE_STATUSES,
  KNOWLEDGE_MAX_CONTENT_LENGTH,
  isKnowledgeArticleStatus,
  isKnowledgeArticleVisibility,
  isValidKnowledgeSlug,
  normalizeKnowledgeSlug,
} from '@ai-support/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { ensureOrgMembership } from '../support.service.js';
import { emitSupportEvent } from '../analytics/supportEvents.service.js';
import { hashContent, replaceChunksForVersion } from './knowledgeChunk.service.js';

const PUBLISH_STATUSES = new Set(['published']);

function isMissingKnowledgeTable(error) {
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.message?.includes('knowledge_articles')
  );
}

function assertContentLength(content) {
  if (typeof content !== 'string') {
    throw new HttpError(400, 'content must be a string.');
  }
  if (content.length > KNOWLEDGE_MAX_CONTENT_LENGTH) {
    throw new HttpError(400, `content must be at most ${KNOWLEDGE_MAX_CONTENT_LENGTH} characters.`);
  }
}

function normalizeTags(tags) {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) {
    throw new HttpError(400, 'tags must be an array of strings.');
  }
  const out = tags
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean)
    .slice(0, 32);
  for (const t of out) {
    if (t.length > 64) throw new HttpError(400, 'Each tag must be at most 64 characters.');
  }
  return out;
}

async function loadArticle(organizationId, articleId) {
  const { data, error } = await supabaseAdmin
    .from('knowledge_articles')
    .select('*')
    .eq('id', articleId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    if (isMissingKnowledgeTable(error)) {
      throw new HttpError(503, 'Knowledge base is not available. Apply database migrations.');
    }
    throw new HttpError(500, error.message || 'Failed to load article.');
  }
  if (!data) throw new HttpError(404, 'Article not found.');
  return data;
}

async function nextVersionNumber(articleId) {
  const { data, error } = await supabaseAdmin
    .from('article_versions')
    .select('version_number')
    .eq('article_id', articleId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load version number.');
  return (data?.version_number ?? 0) + 1;
}

async function getLatestVersion(articleId) {
  const { data, error } = await supabaseAdmin
    .from('article_versions')
    .select('*')
    .eq('article_id', articleId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load article version.');
  return data;
}

/**
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} [params.status]
 * @param {number} params.page
 * @param {number} params.pageSize
 */
export async function listKnowledgeArticles({ organizationId, status, page, pageSize }) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabaseAdmin
    .from('knowledge_articles')
    .select(
      'id, organization_id, title, slug, visibility, status, published_version_id, tags, created_at, updated_at',
      { count: 'exact' },
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (status) {
    if (!isKnowledgeArticleStatus(status)) {
      throw new HttpError(400, `status must be one of: ${KNOWLEDGE_ARTICLE_STATUSES.join(', ')}.`);
    }
    q = q.eq('status', status);
  }

  const { data, error, count } = await q.range(from, to);

  if (error) {
    if (isMissingKnowledgeTable(error)) {
      throw new HttpError(503, 'Knowledge base is not available. Apply database migrations.');
    }
    throw new HttpError(500, error.message || 'Failed to list articles.');
  }

  return {
    articles: data ?? [],
    page,
    pageSize,
    total: count ?? 0,
  };
}

/**
 * @param {object} params
 */
export async function getKnowledgeArticle({ organizationId, articleId, includeContent = true }) {
  const article = await loadArticle(organizationId, articleId);

  let version = null;
  const versionId = article.published_version_id;
  if (includeContent) {
    if (versionId) {
      const { data, error } = await supabaseAdmin
        .from('article_versions')
        .select('id, version_number, content, content_hash, created_at, created_by')
        .eq('id', versionId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw new HttpError(500, error.message || 'Failed to load published version.');
      version = data;
    }
    if (!version) {
      version = await getLatestVersion(articleId);
    }
  }

  let chunkCount = 0;
  if (version?.id) {
    const { count, error } = await supabaseAdmin
      .from('knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('article_version_id', version.id);
    if (!error) chunkCount = count ?? 0;
  }

  return { article, version, chunkCount };
}

/**
 * Create draft article + initial version.
 */
export async function createKnowledgeArticle({
  organizationId,
  actorUserId,
  title,
  slug: slugInput,
  content,
  visibility = 'internal',
  tags,
}) {
  const member = await ensureOrgMembership(actorUserId, organizationId);

  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  if (!trimmedTitle || trimmedTitle.length > 500) {
    throw new HttpError(400, 'title is required (max 500 characters).');
  }

  let slug;
  try {
    slug = normalizeKnowledgeSlug(trimmedTitle, slugInput);
  } catch {
    throw new HttpError(400, 'Invalid slug: use lowercase letters, numbers, and hyphens only.');
  }

  if (!isKnowledgeArticleVisibility(visibility)) {
    throw new HttpError(400, 'visibility must be public, internal, or restricted.');
  }

  assertContentLength(content ?? '');
  const normalizedTags = normalizeTags(tags) ?? [];

  const { data: article, error: articleError } = await supabaseAdmin
    .from('knowledge_articles')
    .insert({
      organization_id: organizationId,
      title: trimmedTitle,
      slug,
      visibility,
      status: 'draft',
      tags: normalizedTags,
      created_by: member.id,
    })
    .select('*')
    .single();

  if (articleError) {
    if (articleError.code === '23505') {
      throw new HttpError(409, 'An article with this slug already exists in this organization.');
    }
    if (isMissingKnowledgeTable(articleError)) {
      throw new HttpError(503, 'Knowledge base is not available. Apply database migrations.');
    }
    throw new HttpError(500, articleError.message || 'Failed to create article.');
  }

  const version = await insertArticleVersion({
    organizationId,
    articleId: article.id,
    memberId: member.id,
    content: content ?? '',
  });

  return { article, version };
}

async function insertArticleVersion({ organizationId, articleId, memberId, content }) {
  assertContentLength(content);
  const versionNumber = await nextVersionNumber(articleId);
  const content_hash = hashContent(content);

  const { data, error } = await supabaseAdmin
    .from('article_versions')
    .insert({
      article_id: articleId,
      organization_id: organizationId,
      version_number: versionNumber,
      content,
      content_hash,
      created_by: memberId,
    })
    .select('*')
    .single();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to create article version.');
  }

  await supabaseAdmin
    .from('knowledge_articles')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', articleId)
    .eq('organization_id', organizationId);

  return data;
}

/**
 * Patch article metadata; optional publish via status.
 */
export async function patchKnowledgeArticle({
  organizationId,
  articleId,
  actorUserId,
  title,
  slug,
  visibility,
  status,
  tags,
}) {
  await ensureOrgMembership(actorUserId, organizationId);
  const article = await loadArticle(organizationId, articleId);

  const updates = { updated_at: new Date().toISOString() };

  if (title !== undefined) {
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle || trimmedTitle.length > 500) {
      throw new HttpError(400, 'title must be 1–500 characters.');
    }
    updates.title = trimmedTitle;
  }

  if (slug !== undefined) {
    const s = typeof slug === 'string' ? slug.trim().toLowerCase() : '';
    if (!isValidKnowledgeSlug(s)) {
      throw new HttpError(400, 'Invalid slug: use lowercase letters, numbers, and hyphens only.');
    }
    updates.slug = s;
  }

  if (visibility !== undefined) {
    if (!isKnowledgeArticleVisibility(visibility)) {
      throw new HttpError(400, 'visibility must be public, internal, or restricted.');
    }
    updates.visibility = visibility;
  }

  if (tags !== undefined) {
    updates.tags = normalizeTags(tags);
  }

  if (status !== undefined) {
    if (!isKnowledgeArticleStatus(status)) {
      throw new HttpError(400, `status must be one of: ${KNOWLEDGE_ARTICLE_STATUSES.join(', ')}.`);
    }
    updates.status = status;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('knowledge_articles')
    .update(updates)
    .eq('id', articleId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'An article with this slug already exists in this organization.');
    }
    throw new HttpError(500, error.message || 'Failed to update article.');
  }

  if (status === 'published' && article.status !== 'published') {
    return publishKnowledgeArticle({ organizationId, articleId, actorUserId });
  }

  return { article: updated };
}

/**
 * Soft-delete article.
 */
export async function archiveKnowledgeArticle({ organizationId, articleId, actorUserId }) {
  const member = await ensureOrgMembership(actorUserId, organizationId);
  await loadArticle(organizationId, articleId);

  const { data, error } = await supabaseAdmin
    .from('knowledge_articles')
    .update({
      status: 'archived',
      deleted_at: new Date().toISOString(),
      deleted_by: member.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', articleId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) throw new HttpError(500, error.message || 'Failed to archive article.');
  return { article: data };
}

/**
 * New immutable version from editor save (draft).
 */
export async function createArticleVersion({
  organizationId,
  articleId,
  actorUserId,
  content,
}) {
  const member = await ensureOrgMembership(actorUserId, organizationId);
  await loadArticle(organizationId, articleId);
  assertContentLength(content);

  const version = await insertArticleVersion({
    organizationId,
    articleId,
    memberId: member.id,
    content,
  });

  return { version };
}

/**
 * Publish: use latest version (or specified), generate chunks, set published pointer.
 */
export async function publishKnowledgeArticle({
  organizationId,
  articleId,
  actorUserId,
  versionId,
}) {
  const member = await ensureOrgMembership(actorUserId, organizationId);
  const article = await loadArticle(organizationId, articleId);

  let version;
  if (versionId) {
    const { data, error } = await supabaseAdmin
      .from('article_versions')
      .select('*')
      .eq('id', versionId)
      .eq('article_id', articleId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message || 'Failed to load version.');
    if (!data) throw new HttpError(404, 'Article version not found.');
    version = data;
  } else {
    version = await getLatestVersion(articleId);
    if (!version) {
      throw new HttpError(400, 'No content version exists. Save content before publishing.');
    }
  }

  await replaceChunksForVersion({
    organizationId,
    articleVersionId: version.id,
    content: version.content,
  });

  const { data: updated, error } = await supabaseAdmin
    .from('knowledge_articles')
    .update({
      status: 'published',
      published_version_id: version.id,
      content_hash: version.content_hash,
      updated_at: new Date().toISOString(),
    })
    .eq('id', articleId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) {
    throw new HttpError(500, error.message || 'Failed to publish article.');
  }

  const { count: chunkCount } = await supabaseAdmin
    .from('knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('article_version_id', version.id);

  emitSupportEvent({
    organizationId,
    eventType: 'knowledge.article_published',
    entityType: 'article',
    entityId: articleId,
    actorMemberId: member.id,
    payload: { chunkCount: chunkCount ?? 0 },
  });

  return { article: updated, version, chunkCount: chunkCount ?? 0 };
}

/** Re-chunk published version (e.g. after manual repair). ADMIN-only at controller. */
export async function reindexPublishedArticle({ organizationId, articleId, actorUserId }) {
  const member = await ensureOrgMembership(actorUserId, organizationId);
  const article = await loadArticle(organizationId, articleId);

  if (!PUBLISH_STATUSES.has(article.status) || !article.published_version_id) {
    throw new HttpError(400, 'Article must be published with a published version to reindex.');
  }

  const { data: version, error } = await supabaseAdmin
    .from('article_versions')
    .select('*')
    .eq('id', article.published_version_id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !version) {
    throw new HttpError(404, 'Published version not found.');
  }

  await replaceChunksForVersion({
    organizationId,
    articleVersionId: version.id,
    content: version.content,
  });

  return { article, version, reindexed: true, memberId: member.id };
}
