import { createHash } from 'node:crypto';

const URL_RE = /https?:\/\/|www\./gi;
const DEFAULT_BLOCKLIST = [
  'unsubscribe',
  'click here',
  'act now',
  'limited time',
  'winner',
  'congratulations',
  'crypto',
  'bitcoin',
  'viagra',
  'casino',
];

/**
 * Normalize customer text for hashing / duplicate detection.
 *
 * @param {string} text
 */
export function normalizeIngressContent(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * @param {string} normalized
 */
export function hashIngressContent(normalized) {
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Lightweight spam scoring (no LLM).
 *
 * @param {object} params
 * @param {string} params.message
 * @param {string[]} [params.blocklist]
 * @returns {{ score: number, signals: string[], isSpam: boolean }}
 */
export function scoreInboundSpam({ message, blocklist = [] }) {
  const text = String(message ?? '').trim();
  const normalized = normalizeIngressContent(text);
  const signals = [];

  if (!normalized) {
    return { score: 0, signals, isSpam: false };
  }

  const combinedBlocklist = [...DEFAULT_BLOCKLIST, ...blocklist];
  for (const phrase of combinedBlocklist) {
    if (phrase && normalized.includes(phrase)) {
      signals.push(`blocklist:${phrase}`);
    }
  }

  const urlHits = (text.match(URL_RE) ?? []).length;
  if (urlHits >= 4) signals.push('excess_links');
  else if (urlHits >= 2) signals.push('multiple_links');

  if (text.length >= 24) {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= 12) {
      const upper = letters.replace(/[^A-Z]/g, '').length;
      if (upper / letters.length >= 0.75) signals.push('shouting');
    }
  }

  if (/(.)\1{7,}/.test(text)) signals.push('repeated_chars');

  const score = signals.length;
  const isSpam = score >= 2 || signals.some((s) => s.startsWith('blocklist:'));

  return { score, signals, isSpam };
}
