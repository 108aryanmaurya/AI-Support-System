import { Router } from 'express';
import { requireRole } from '../middleware/orgAccess.js';
import { knowledgeSearchRateLimit, knowledgeUploadRateLimit } from '../middleware/knowledgeRateLimit.js';
import { knowledgeUploadMiddleware } from '../middleware/knowledgeUpload.js';
import {
  archiveKnowledgeArticleController,
  createArticleVersionController,
  createKnowledgeArticleController,
  getKnowledgeArticleController,
  listKnowledgeArticlesController,
  listKnowledgeSourcesController,
  patchKnowledgeArticleController,
  publishKnowledgeArticleController,
  reindexKnowledgeArticleController,
  searchKnowledgeController,
  syncKnowledgeSourceController,
  uploadKnowledgeSourceController,
} from '../controllers/knowledge.controller.js';

const router = Router({ mergeParams: true });

router.get('/search', knowledgeSearchRateLimit, searchKnowledgeController);
router.get('/sources', listKnowledgeSourcesController);
router.post(
  '/sources/upload',
  knowledgeUploadRateLimit,
  knowledgeUploadMiddleware,
  uploadKnowledgeSourceController,
);
router.post('/sources/:sourceId/sync', syncKnowledgeSourceController);
router.get('/articles', listKnowledgeArticlesController);
router.post('/articles', createKnowledgeArticleController);
router.get('/articles/:articleId', getKnowledgeArticleController);
router.patch('/articles/:articleId', patchKnowledgeArticleController);
router.delete('/articles/:articleId', requireRole('ADMIN'), archiveKnowledgeArticleController);
router.post('/articles/:articleId/versions', createArticleVersionController);
router.post('/articles/:articleId/publish', publishKnowledgeArticleController);
router.post('/articles/:articleId/reindex', requireRole('ADMIN'), reindexKnowledgeArticleController);

export default router;
