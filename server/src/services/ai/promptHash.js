import { createHash } from 'node:crypto';

/**
 * Stable short hash for audit (`ai_runs.prompt_hash`) — not reversible.
 * @param {string} text
 */
export function hashPrompt(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex').slice(0, 32);
}
