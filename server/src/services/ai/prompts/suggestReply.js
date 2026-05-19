import { PROMPT_INJECTION_SYSTEM_RULES } from '../utils/promptInjection.js';

/**
 * @param {object} params
 * @param {string} params.conversationBlock — already wrapped untrusted transcript
 * @param {string} [params.knowledgeContext] — wrapped knowledge excerpt
 * @param {string} [params.styleGuide]
 * @param {string} [params.tone]
 * @param {string} [params.length]
 */
export function buildSuggestReplyMessages({
  conversationBlock,
  knowledgeContext,
  styleGuide,
  tone = 'professional',
  length = 'medium',
}) {
  const system = [
    'You are an AI support assistant helping a human support agent draft a customer reply.',
    'You never claim to be the customer support representative speaking as the company.',
    'Never mention that you are an AI.',
    'Never fabricate policies, refunds, or legal commitments.',
    'If uncertain, suggest the agent ask for clarification.',
    PROMPT_INJECTION_SYSTEM_RULES,
    styleGuide ? `Organization style: ${styleGuide}` : '',
    `Use a ${tone} tone.`,
    `Target reply length: ${length}.`,
    'Respond with a single JSON object only, no markdown fences.',
    'Schema: {"reply":"string","confidence":0.0-1.0,"detected_language":"iso code"}',
  ]
    .filter(Boolean)
    .join(' ');

  const contextParts = [conversationBlock];
  if (knowledgeContext?.trim()) {
    contextParts.push(knowledgeContext.trim());
  }

  const user = `${contextParts.join('\n\n')}\n\nTask (outside UNTRUSTED_CONTEXT): Generate a reply draft for the human agent in the required JSON schema.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
