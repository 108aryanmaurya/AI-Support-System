/** Knowledge article lifecycle statuses (Phase 2). */
export const KNOWLEDGE_ARTICLE_STATUSES = Object.freeze([
  'draft',
  'review_pending',
  'approved',
  'published',
  'archived',
]);

/** Who can see the article. */
export const KNOWLEDGE_ARTICLE_VISIBILITIES = Object.freeze(['public', 'internal', 'restricted']);

/** Ingestion source types (Sprint 3 expands file pipeline). */
export const KNOWLEDGE_SOURCE_TYPES = Object.freeze(['manual', 'file']);

export const KNOWLEDGE_SOURCE_STATUSES = Object.freeze([
  'pending',
  'processing',
  'processed',
  'failed',
  'retrying',
  'archived',
]);

/** Max article body length (chars) — matches DB check. */
export const KNOWLEDGE_MAX_CONTENT_LENGTH = 500_000;

/** Max chunks per article version. */
export const KNOWLEDGE_MAX_CHUNKS_PER_VERSION = 500;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** @param {unknown} v */
export function isKnowledgeArticleStatus(v) {
  return typeof v === 'string' && KNOWLEDGE_ARTICLE_STATUSES.includes(v);
}

/** @param {unknown} v */
export function isKnowledgeArticleVisibility(v) {
  return typeof v === 'string' && KNOWLEDGE_ARTICLE_VISIBILITIES.includes(v);
}

/**
 * URL-safe slug from title or validate explicit slug.
 * @param {string} title
 * @param {string | undefined} explicitSlug
 */
export function normalizeKnowledgeSlug(title, explicitSlug) {
  const raw =
    typeof explicitSlug === 'string' && explicitSlug.trim()
      ? explicitSlug.trim().toLowerCase()
      : String(title ?? '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 200);

  if (!raw || !SLUG_RE.test(raw)) {
    throw new Error('Invalid slug: use lowercase letters, numbers, and hyphens only.');
  }
  return raw;
}

/** @param {string} slug */
export function isValidKnowledgeSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug) && slug.length <= 200;
}
