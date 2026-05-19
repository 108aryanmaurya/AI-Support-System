import { HttpError } from '../../utils/httpError.js';
import { AI_ERROR_CODES } from './ai.errors.js';

/** Machine-readable violation codes stored on ai_runs.error_code. */
export const POLICY_VIOLATION_CODES = Object.freeze([
  'refund_promise',
  'impersonation',
  'legal_commitment',
]);

/** @type {Array<{ code: string, pattern: RegExp }>} */
const OUTPUT_POLICY_RULES = [
  {
    code: 'refund_promise',
    pattern:
      /\b(?:i|we)\s+(?:will|have|can|shall|'ll|'ve)\s+(?:issue|process|approve|grant|send|provide)\s+(?:a\s+)?(?:full\s+)?refund\b|\brefund\s+(?:has\s+been|is|was)\s+(?:issued|processed|approved|sent)\b|\byou\s+will\s+(?:receive|get)\s+(?:a\s+)?refund\b|\b(?:100%|full)\s+money[- ]back\s+guarantee\b/i,
  },
  {
    code: 'impersonation',
    pattern:
      /\bi\s+am\s+(?:the\s+)?(?:company|brand|business|organization|support\s+team|customer\s+service|your\s+official\s+representative)\b|\bi\s+speak\s+(?:for|on\s+behalf\s+of)\s+(?:the\s+)?(?:company|brand)\b|\bas\s+(?:an?\s+)?(?:official|authorized)\s+(?:representative|agent)\s+of\b|\bthis\s+is\s+(?:the\s+)?(?:company|brand)\s+(?:speaking|here)\b/i,
  },
  {
    code: 'legal_commitment',
    pattern:
      /\b(?:legally|lawfully)\s+(?:obligated|bound|required)\s+to\b|\bwe\s+(?:legally\s+)?guarantee\b|\bwithout\s+(?:any\s+)?(?:further\s+)?liability\b|\b(?:binding|enforceable)\s+(?:agreement|contract)\b/i,
  },
];

/**
 * Scan model output for disallowed customer-facing commitments (agent-assist drafts).
 * @param {string} text
 * @returns {{ blocked: boolean, violations: string[] }}
 */
export function scanOutputPolicy(text) {
  const sample = typeof text === 'string' ? text.trim() : '';
  if (!sample) {
    return { blocked: false, violations: [] };
  }

  /** @type {string[]} */
  const violations = [];

  for (const rule of OUTPUT_POLICY_RULES) {
    if (rule.pattern.test(sample)) {
      violations.push(rule.code);
    }
  }

  return { blocked: violations.length > 0, violations };
}

/**
 * @param {string[]} violations
 */
export function policyBlockedError(violations = []) {
  const err = new HttpError(
    403,
    'AI output was blocked by safety policy. Edit the draft manually or rephrase your request.',
  );
  err.code = AI_ERROR_CODES.POLICY_BLOCKED;
  err.policyViolations = violations;
  return err;
}
