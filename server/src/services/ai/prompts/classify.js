import {
  CLASSIFICATION_INTENTS,
  CLASSIFICATION_SENTIMENTS,
} from '@ai-support/shared';
import { PROMPT_INJECTION_SYSTEM_RULES } from '../utils/promptInjection.js';

/**
 * @param {object} params
 * @param {string} params.conversationBlock
 * @param {string} params.latestCustomerMessage
 * @param {string[]} [params.orgTagNames]
 */
export function buildClassifyMessages({
  conversationBlock,
  latestCustomerMessage,
  orgTagNames = [],
}) {
  const tagHint =
    orgTagNames.length > 0
      ? `Prefer auto_tags from these org tag names when applicable: ${orgTagNames.join(', ')}.`
      : 'Suggest short lowercase auto_tags (e.g. refund, billing) when clearly applicable.';

  return [
    {
      role: 'system',
      content: `You classify customer support conversations. Respond with JSON only.

Rules:
- Classify primarily from the LATEST CUSTOMER MESSAGE; use conversation context for disambiguation only.
- Do not invent facts, policies, or resolutions.
- intent must be one of: ${CLASSIFICATION_INTENTS.join(', ')}.
- sentiment must be one of: ${CLASSIFICATION_SENTIMENTS.join(', ')}.
- sentiment_score is a number from 0 (neutral/calm) to 1 (strong emotion/urgency).
- language is a short ISO 639-1 code (e.g. en, es) or "unknown".
- auto_tags: up to 5 short lowercase labels; ${tagHint}

${PROMPT_INJECTION_SYSTEM_RULES}

Output schema:
{
  "intent": "string",
  "sentiment": "string",
  "sentiment_score": 0.0,
  "language": "string",
  "auto_tags": ["string"]
}`,
    },
    {
      role: 'user',
      content: `${conversationBlock}

${latestCustomerMessage}

Task (outside UNTRUSTED_CONTEXT): Classify using the latest customer message block above.`,
    },
  ];
}
