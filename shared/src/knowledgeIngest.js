/** Max upload size for knowledge file ingestion (bytes). */
export const KNOWLEDGE_MAX_UPLOAD_BYTES = 512_000;

export const KNOWLEDGE_ALLOWED_UPLOAD_MIMES = Object.freeze([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/pdf',
]);

export const KNOWLEDGE_ALLOWED_UPLOAD_EXTENSIONS = Object.freeze(['.txt', '.md', '.markdown', '.pdf']);

/** @param {string} mime */
export function isAllowedKnowledgeUploadMime(mime) {
  const m = String(mime ?? '').toLowerCase().split(';')[0].trim();
  return KNOWLEDGE_ALLOWED_UPLOAD_MIMES.includes(m);
}
