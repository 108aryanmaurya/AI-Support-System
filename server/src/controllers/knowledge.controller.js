import { HttpError } from '../utils/httpError.js';
import { emitSupportEvent } from '../services/analytics/supportEvents.service.js';
import { getPagination } from '../services/support.service.js';
import { assembleKnowledgeContext } from '../services/knowledge/contextAssembly.service.js';
import { retrieveKnowledge } from '../services/knowledge/retrieval.service.js';
import {
  archiveKnowledgeArticle,
  createArticleVersion,
  createKnowledgeArticle,
  getKnowledgeArticle,
  listKnowledgeArticles,
  patchKnowledgeArticle,
  publishKnowledgeArticle,
  reindexPublishedArticle,
} from '../services/knowledge/knowledge.service.js';
import {
  createFileKnowledgeSource,
  listKnowledgeSources,
  syncKnowledgeSource,
} from '../services/knowledge/knowledgeSource.service.js';

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
  return id;
}

function actorUserIdOrThrow(req) {
  const id = req.userId ?? req.user?.id;
  if (!id) throw new HttpError(401, 'Authentication required.');
  return id;
}

export async function listKnowledgeArticlesController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const { page, pageSize } = getPagination(req.query);
    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim()
        : undefined;

    const result = await listKnowledgeArticles({
      organizationId,
      status,
      page,
      pageSize,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getKnowledgeArticleController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const articleId = req.params.articleId;
    if (!articleId) throw new HttpError(400, 'articleId is required.');

    const includeContent = req.query.includeContent !== 'false';
    const result = await getKnowledgeArticle({ organizationId, articleId, includeContent });

    emitSupportEvent({
      organizationId,
      eventType: 'knowledge.article_viewed',
      entityType: 'article',
      entityId: articleId,
      actorMemberId: req.orgMembership?.id ?? null,
      payload: { articleId, slug: result.article?.slug },
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function searchKnowledgeController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = req.query.limit;
    const mode = typeof req.query.mode === 'string' ? req.query.mode : 'keyword';
    const includeContext = req.query.includeContext === 'true';

    const retrieval = await retrieveKnowledge({
      organizationId,
      query: q,
      mode,
      limit,
      memberId: req.orgMembership?.id ?? null,
    });

    emitSupportEvent({
      organizationId,
      eventType: 'knowledge.search',
      entityType: 'article',
      entityId: organizationId,
      actorMemberId: req.orgMembership?.id ?? null,
      payload: {
        queryLength: q.trim().length,
        resultCount: retrieval.total ?? 0,
        mode: retrieval.mode,
      },
    });

    const body = { ...retrieval };
    if (includeContext && retrieval.results?.length) {
      body.context = assembleKnowledgeContext({ chunks: retrieval.results });
    }

    res.json(body);
  } catch (e) {
    next(e);
  }
}

export async function createKnowledgeArticleController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const body = req.body ?? {};
    const { title, slug, content, visibility, tags } = body;

    if (!title || typeof title !== 'string') {
      throw new HttpError(400, 'title is required.');
    }

    const result = await createKnowledgeArticle({
      organizationId,
      actorUserId,
      title,
      slug,
      content: content ?? '',
      visibility,
      tags,
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function patchKnowledgeArticleController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const articleId = req.params.articleId;
    if (!articleId) throw new HttpError(400, 'articleId is required.');

    const body = req.body ?? {};
    const hasField =
      Object.prototype.hasOwnProperty.call(body, 'title') ||
      Object.prototype.hasOwnProperty.call(body, 'slug') ||
      Object.prototype.hasOwnProperty.call(body, 'visibility') ||
      Object.prototype.hasOwnProperty.call(body, 'status') ||
      Object.prototype.hasOwnProperty.call(body, 'tags');

    if (!hasField) {
      throw new HttpError(400, 'Provide at least one of: title, slug, visibility, status, tags.');
    }

    const result = await patchKnowledgeArticle({
      organizationId,
      articleId,
      actorUserId,
      title: body.title,
      slug: body.slug,
      visibility: body.visibility,
      status: body.status,
      tags: body.tags,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function createArticleVersionController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const articleId = req.params.articleId;
    if (!articleId) throw new HttpError(400, 'articleId is required.');

    const { content } = req.body ?? {};
    if (content === undefined) {
      throw new HttpError(400, 'content is required.');
    }

    const result = await createArticleVersion({
      organizationId,
      articleId,
      actorUserId,
      content,
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function publishKnowledgeArticleController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const articleId = req.params.articleId;
    if (!articleId) throw new HttpError(400, 'articleId is required.');

    const versionId =
      typeof req.body?.versionId === 'string' ? req.body.versionId.trim() : undefined;

    const result = await publishKnowledgeArticle({
      organizationId,
      articleId,
      actorUserId,
      versionId: versionId || undefined,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function archiveKnowledgeArticleController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const articleId = req.params.articleId;
    if (!articleId) throw new HttpError(400, 'articleId is required.');

    const result = await archiveKnowledgeArticle({
      organizationId,
      articleId,
      actorUserId,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function listKnowledgeSourcesController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim()
        : undefined;
    const result = await listKnowledgeSources(organizationId, { status });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function uploadKnowledgeSourceController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const file = req.file;
    if (!file) throw new HttpError(400, 'file is required (multipart field "file").');

    const result = await createFileKnowledgeSource({
      organizationId,
      actorUserId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function syncKnowledgeSourceController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const sourceId = req.params.sourceId;
    if (!sourceId) throw new HttpError(400, 'sourceId is required.');

    const result = await syncKnowledgeSource({
      organizationId,
      sourceId,
      actorUserId,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function reindexKnowledgeArticleController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const articleId = req.params.articleId;
    if (!articleId) throw new HttpError(400, 'articleId is required.');

    const result = await reindexPublishedArticle({
      organizationId,
      articleId,
      actorUserId,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}
