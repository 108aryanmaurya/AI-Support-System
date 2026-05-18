/**
 * @param {object} params
 * @param {string} params.conversationBlock
 * @param {string} [params.knowledgeContext]
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
    styleGuide ? `Organization style: ${styleGuide}` : '',
    `Use a ${tone} tone.`,
    `Target reply length: ${length}.`,
    'Respond with a single JSON object only, no markdown fences.',
    'Schema: {"reply":"string","confidence":0.0-1.0,"detected_language":"iso code"}',
  ]
    .filter(Boolean)
    .join(' ');

  let user = conversationBlock;
  if (knowledgeContext?.trim()) {
    user += `\n\nRelevant knowledge:\n${knowledgeContext.trim()}`;
  }
  user += '\n\nGenerate a reply draft for the human agent in the required JSON schema.';

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
